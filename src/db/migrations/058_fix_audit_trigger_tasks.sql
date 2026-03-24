-- Migration 058: Fix audit_direct_insert trigger for tasks table
-- Issue: Trigger references NEW.source but tasks table has no source column
-- Fix: Set v_source := 'unknown' for tasks (same as issues table)
-- Related: This is the same fix as 057 but for tasks table

CREATE OR REPLACE FUNCTION audit_direct_insert() RETURNS TRIGGER AS $$
DECLARE
    v_source TEXT := 'unknown';
    v_author TEXT := 'unknown';
    v_record_id UUID;
    v_instruction TEXT;
    v_allowed_sources TEXT[] := ARRAY['areflect', 'cli', 'heartbeat', 'scheduler', 'migration', 'system', 'api'];
BEGIN
    IF TG_TABLE_NAME = 'project_communications' THEN
        IF NEW.from_ai = 'nezha-audit' THEN
            RETURN NEW;
        END IF;
        v_author := COALESCE(NEW.from_ai, 'unknown');
        v_source := COALESCE(NEW.message_type, 'unknown');
    ELSIF TG_TABLE_NAME = 'meeting_opinions' THEN
        v_author := COALESCE(NEW.author, 'unknown');
        v_source := 'unknown';
    ELSIF TG_TABLE_NAME = 'tasks' THEN
        v_author := COALESCE(NEW.created_by, 'unknown');
        v_source := 'unknown';  -- tasks table has no source column
    ELSIF TG_TABLE_NAME = 'issues' THEN
        v_author := COALESCE(NEW.discovered_by, 'unknown');
        v_source := 'unknown';
    ELSIF TG_TABLE_NAME = 'scheduled_tasks' THEN
        v_author := COALESCE(NEW.created_by, 'unknown');
        v_source := COALESCE(NEW.source, 'unknown');
    ELSIF TG_TABLE_NAME = 'prompt_suggestions' THEN
        v_author := COALESCE(NEW.author, 'unknown');
        v_source := COALESCE(NEW.source, 'unknown');
    ELSE
        BEGIN
            v_source := COALESCE(NEW.source, 'unknown');
        EXCEPTION WHEN undefined_column THEN
            v_source := 'unknown';
        END;
        BEGIN
            v_author := COALESCE(NEW.agent_id::text, 'unknown');
        EXCEPTION WHEN undefined_column THEN
            v_author := 'unknown';
        END;
    END IF;
    
    v_record_id := NEW.id;
    
    IF v_source = 'unknown' OR v_source NOT IN (SELECT unnest(v_allowed_sources)) THEN
        INSERT INTO direct_insert_audit (table_name, source, author, record_id)
        VALUES (TG_TABLE_NAME, v_source, v_author, v_record_id);
        
        SELECT instruction INTO v_instruction
        FROM insert_reminders
        WHERE table_name = TG_TABLE_NAME AND enabled = TRUE;
        
        IF v_instruction IS NOT NULL THEN
            INSERT INTO project_communications (from_ai, to_ai, message_type, content, priority)
            VALUES (
                'nezha-audit',
                v_author,
                'notification',
                'Direct INSERT detected on ' || TG_TABLE_NAME || E'\n\n' || v_instruction || E'\n\nPlease use areflect or CLI commands for better tracking and consistency.',
                'high'
            );
            
            UPDATE direct_insert_audit 
            SET reminder_sent = TRUE 
            WHERE id = (SELECT id FROM direct_insert_audit ORDER BY created_at DESC LIMIT 1);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit_direct_insert() IS 'Trigger function that audits direct inserts and sends reminders to use areflect or CLI. Fixed in migration 058 to use unknown source for tasks table (no source column).';

-- Vibe-Author: bot_b17225f3-23e8-48a7-b009-924cfb8bb551

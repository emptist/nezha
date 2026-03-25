-- Fix audit trigger to allow common message types used by system services
-- These message types are used legitimately by BroadcastService, ReviewService, LearningServer, etc.

CREATE OR REPLACE FUNCTION audit_direct_insert() RETURNS TRIGGER AS $$
DECLARE
    v_source TEXT := 'unknown';
    v_author TEXT := 'unknown';
    v_record_id UUID;
    v_instruction TEXT;
    v_allowed_sources TEXT[] := ARRAY['areflect', 'cli', 'heartbeat', 'scheduler', 'migration', 'system', 'api', 'broadcast', 'answer', 'notification', 'response'];
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
        v_source := COALESCE(NEW.source, 'unknown');
    ELSIF TG_TABLE_NAME = 'issues' THEN
        v_author := COALESCE(NEW.reported_by, 'unknown');
        v_source := COALESCE(NEW.source, 'unknown');
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
        WHERE table_name = TG_TABLE_NAME;
        
        IF v_instruction IS NOT NULL THEN
            RAISE NOTICE '%', v_instruction;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

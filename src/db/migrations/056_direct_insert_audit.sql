-- Migration 056: Direct Insert Audit System
-- Purpose: Audit and remind AIs to use areflect or CLI instead of direct database inserts
-- Approach: Soft enforcement - log violations and send reminders

-- ============================================================================
-- 1. Create audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS direct_insert_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    source TEXT,
    author TEXT,
    record_id UUID,
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_direct_insert_audit_created_at ON direct_insert_audit(created_at DESC);
CREATE INDEX idx_direct_insert_audit_table_name ON direct_insert_audit(table_name);
CREATE INDEX idx_direct_insert_audit_author ON direct_insert_audit(author);

-- ============================================================================
-- 2. Create reminder instructions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS insert_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL UNIQUE,
    instruction TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default reminders for key tables
INSERT INTO insert_reminders (table_name, instruction) VALUES
('memory', 'Use areflect [LEARN] or CLI "learn" command instead of direct INSERT into memory table.'),
('tasks', 'Use areflect [TASK] or CLI "task-add" command instead of direct INSERT into tasks table.'),
('issues', 'Use areflect [ISSUE] or CLI "issue create" command instead of direct INSERT into issues table.'),
('prompt_suggestions', 'Use areflect [PROMPT_UPDATE] or CLI "prompt-suggest" command instead of direct INSERT into prompt_suggestions table.'),
('project_communications', 'Use areflect [ANNOUNCE] or CLI "announce" command instead of direct INSERT into project_communications table.'),
('scheduled_tasks', 'Use areflect [SCHEDULE] or CLI "schedule" command instead of direct INSERT into scheduled_tasks table.'),
('meeting_opinions', 'Use areflect [OPINION] or CLI "meeting opinion" command instead of direct INSERT into meeting_opinions table.')
ON CONFLICT (table_name) DO NOTHING;

-- ============================================================================
-- 3. Create trigger function for auditing and reminding
-- ============================================================================

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
        IF EXISTS (
            SELECT 1 FROM direct_insert_audit 
            WHERE table_name = TG_TABLE_NAME 
            AND author = v_author 
            AND reminder_sent = TRUE 
            AND created_at > NOW() - INTERVAL '1 hour'
        ) THEN
            RETURN NEW;
        END IF;
        
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

-- ============================================================================
-- 4. Create triggers for key tables
-- ============================================================================

-- Memory table
DROP TRIGGER IF EXISTS audit_memory_insert ON memory;
CREATE TRIGGER audit_memory_insert
    AFTER INSERT ON memory
    FOR EACH ROW EXECUTE FUNCTION audit_direct_insert();

-- Tasks table
DROP TRIGGER IF EXISTS audit_tasks_insert ON tasks;
CREATE TRIGGER audit_tasks_insert
    AFTER INSERT ON tasks
    FOR EACH ROW EXECUTE FUNCTION audit_direct_insert();

-- Issues table
DROP TRIGGER IF EXISTS audit_issues_insert ON issues;
CREATE TRIGGER audit_issues_insert
    AFTER INSERT ON issues
    FOR EACH ROW EXECUTE FUNCTION audit_direct_insert();

-- Prompt suggestions table
DROP TRIGGER IF EXISTS audit_prompt_suggestions_insert ON prompt_suggestions;
CREATE TRIGGER audit_prompt_suggestions_insert
    AFTER INSERT ON prompt_suggestions
    FOR EACH ROW EXECUTE FUNCTION audit_direct_insert();

-- Project communications table
DROP TRIGGER IF EXISTS audit_project_communications_insert ON project_communications;
CREATE TRIGGER audit_project_communications_insert
    AFTER INSERT ON project_communications
    FOR EACH ROW EXECUTE FUNCTION audit_direct_insert();

-- Scheduled tasks table
DROP TRIGGER IF EXISTS audit_scheduled_tasks_insert ON scheduled_tasks;
CREATE TRIGGER audit_scheduled_tasks_insert
    AFTER INSERT ON scheduled_tasks
    FOR EACH ROW EXECUTE FUNCTION audit_direct_insert();

-- Meeting opinions table
DROP TRIGGER IF EXISTS audit_meeting_opinions_insert ON meeting_opinions;
CREATE TRIGGER audit_meeting_opinions_insert
    AFTER INSERT ON meeting_opinions
    FOR EACH ROW EXECUTE FUNCTION audit_direct_insert();

-- ============================================================================
-- 5. Create view for easy audit review
-- ============================================================================

CREATE OR REPLACE VIEW v_direct_insert_violations AS
SELECT 
    dia.id,
    dia.table_name,
    dia.source,
    dia.author,
    dia.reminder_sent,
    dia.created_at,
    ir.instruction
FROM direct_insert_audit dia
LEFT JOIN insert_reminders ir ON ir.table_name = dia.table_name
ORDER BY dia.created_at DESC;

-- ============================================================================
-- 6. Grant permissions
-- ============================================================================

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- ============================================================================
-- 7. Comments for documentation
-- ============================================================================

COMMENT ON TABLE direct_insert_audit IS 'Logs all direct database inserts that bypass areflect or CLI';
COMMENT ON TABLE insert_reminders IS 'Contains reminder instructions for each monitored table';
COMMENT ON FUNCTION audit_direct_insert() IS 'Trigger function that audits direct inserts and sends reminders to use areflect or CLI';
COMMENT ON VIEW v_direct_insert_violations IS 'Easy view to see all direct insert violations with their reminders';

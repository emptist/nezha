-- Migration: 017_task_audit_log
-- Description: Add task audit log for tracking all state changes

-- Create task_audit_log table
CREATE TABLE IF NOT EXISTS task_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    task_title TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX idx_task_audit_task_id ON task_audit_log(task_id);
CREATE INDEX idx_task_audit_created ON task_audit_log(created_at DESC);
CREATE INDEX idx_task_audit_task_status ON task_audit_log(task_id, created_at DESC);

-- Function to log task state change
CREATE OR REPLACE FUNCTION log_task_state_change(
    p_task_id UUID,
    p_task_title TEXT,
    p_previous_status TEXT,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS void AS $$
BEGIN
    INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
    VALUES (p_task_id, p_task_title, p_previous_status, p_new_status, p_reason, p_metadata);
END;
$$ LANGUAGE plpgsql;

-- Function to get task history
CREATE OR REPLACE FUNCTION get_task_history(p_task_id UUID)
RETURNS TABLE(
    id UUID,
    previous_status TEXT,
    new_status TEXT,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tal.id,
        tal.previous_status,
        tal.new_status,
        tal.reason,
        tal.metadata,
        tal.created_at
    FROM task_audit_log tal
    WHERE tal.task_id = p_task_id
    ORDER BY tal.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent task state changes (for debugging)
CREATE OR REPLACE FUNCTION get_recent_task_changes(p_limit INTEGER DEFAULT 50)
RETURNS TABLE(
    task_id UUID,
    task_title TEXT,
    previous_status TEXT,
    new_status TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tal.task_id,
        tal.task_title,
        tal.previous_status,
        tal.new_status,
        tal.reason,
        tal.created_at
    FROM task_audit_log tal
    ORDER BY tal.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
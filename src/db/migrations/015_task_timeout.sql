-- Migration: 015_task_timeout
-- Description: Add configurable task timeouts

-- Add columns for task timeout tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Create index for efficient timeout queries
CREATE INDEX IF NOT EXISTS idx_tasks_started_at ON tasks(started_at) 
WHERE status = 'RUNNING';

-- Add long-running task category (default 30 minutes)
-- Quick tasks: 5 minutes, Long-running: 30 minutes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_long_running BOOLEAN DEFAULT false;

-- Create function to check and fail timed-out tasks
CREATE OR REPLACE FUNCTION check_task_timeouts()
RETURNS TABLE(task_id UUID, title TEXT, error_message TEXT) AS $$
DECLARE
    v_task RECORD;
    v_timeout_seconds INTEGER;
BEGIN
    FOR v_task IN 
        SELECT id, title, timeout_seconds, started_at 
        FROM tasks 
        WHERE status = 'RUNNING' 
        AND started_at IS NOT NULL 
        AND timeout_seconds IS NOT NULL
    LOOP
        -- Use task-specific timeout or default to 5 minutes if not set
        v_timeout_seconds := COALESCE(v_task.timeout_seconds, 300);
        
        IF (NOW() - v_task.started_at) > (v_timeout_seconds || ' seconds')::INTERVAL THEN
            RETURN NEXT (
                v_task.id,
                v_task.title,
                format('Task timed out after %s seconds', v_timeout_seconds)
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Update function to set started_at when task begins execution
CREATE OR REPLACE FUNCTION start_task_execution(p_task_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE tasks 
    SET status = 'RUNNING',
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;
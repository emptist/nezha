-- Migration: 014_task_retry_system
-- Description: Add retry tracking columns and scheduled retry functionality

-- Add columns for retry tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Create index for efficient retry queries
CREATE INDEX IF NOT EXISTS idx_tasks_next_retry_at ON tasks(next_retry_at) 
WHERE status = 'PENDING' AND next_retry_at IS NOT NULL;

-- Update function to schedule task retry
CREATE OR REPLACE FUNCTION schedule_task_retry(
    p_task_id UUID,
    p_retry_count INTEGER,
    p_max_retries INTEGER,
    p_base_delay_ms INTEGER DEFAULT 300000
)
RETURNS void AS $$
DECLARE
    v_delay_ms INTEGER;
    v_next_retry_at TIMESTAMPTZ;
BEGIN
    -- Calculate exponential backoff: base_delay * 2^(retry_count-1)
    -- Base 5 minutes (300000ms), max 30 minutes
    v_delay_ms := LEAST(p_base_delay_ms * POWER(2, p_retry_count - 1), 1800000);
    v_next_retry_at := NOW() + (v_delay_ms || ' milliseconds')::INTERVAL;
    
    UPDATE tasks 
    SET retry_count = p_retry_count + 1,
        next_retry_at = v_next_retry_at,
        updated_at = NOW()
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- Update function to reset retry state for fresh task
CREATE OR REPLACE FUNCTION reset_task_retry(
    p_task_id UUID,
    p_max_retries INTEGER DEFAULT 3
)
RETURNS void AS $$
BEGIN
    UPDATE tasks 
    SET retry_count = 0,
        max_retries = p_max_retries,
        next_retry_at = NULL,
        updated_at = NOW()
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;
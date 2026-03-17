-- Migration: 008_advanced_scheduling
-- Description: Add advanced scheduling features (priority boost, aging, weighted queue)

-- Add retry_count column for tracking task attempts
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add base_priority column to track original priority (for aging calculations)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS base_priority INTEGER;

-- Add weighted_priority column (computed priority based on aging and boost)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS weighted_priority INTEGER;

-- Add last_error column for better error tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Create index on weighted_priority for fast scheduling lookups
CREATE INDEX IF NOT EXISTS idx_tasks_weighted_priority ON tasks(weighted_priority DESC, created_at ASC) WHERE status = 'PENDING';

-- Create index on retry_count for stuck task detection
CREATE INDEX IF NOT EXISTS idx_tasks_retry_count ON tasks(retry_count);

-- Function to calculate weighted priority with aging factor
CREATE OR REPLACE FUNCTION calculate_weighted_priority(
    p_base_priority INTEGER,
    p_created_at TIMESTAMPTZ,
    p_retry_count INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
    aging_bonus INTEGER;
    retry_bonus INTEGER;
    max_priority INTEGER := 100;
BEGIN
    -- Aging factor: tasks older than 1 hour get priority boost
    -- Max bonus of 20 points for tasks older than 24 hours
    aging_bonus := LEAST(20, EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 3600);
    
    -- Retry bonus: each retry adds 5 points (capped at 25)
    retry_bonus := LEAST(25, p_retry_count * 5);
    
    RETURN LEAST(max_priority, p_base_priority + aging_bonus + retry_bonus);
END;
$$ LANGUAGE plpgsql;

-- Function to update weighted priorities for all pending tasks
CREATE OR REPLACE FUNCTION update_weighted_priorities()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE tasks
    SET weighted_priority = calculate_weighted_priority(
        COALESCE(base_priority, priority),
        created_at,
        COALESCE(retry_count, 0)
    ),
    base_priority = COALESCE(base_priority, priority)
    WHERE status = 'PENDING'
    AND weighted_priority IS NULL;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to boost priority of stuck tasks
CREATE OR REPLACE FUNCTION boost_stuck_task_priority(p_task_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE tasks
    SET retry_count = COALESCE(retry_count, 0) + 1,
        priority = LEAST(100, priority + 5),
        weighted_priority = calculate_weighted_priority(
            COALESCE(base_priority, priority + 5),
            created_at,
            COALESCE(retry_count, 0) + 1
        )
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

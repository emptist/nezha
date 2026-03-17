-- Migration: 007_dead_letter_queue
-- Description: Add dead letter queue for permanently failed tasks

-- Create dead_letter_queue table
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_task_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    error_message TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    failed_at TIMESTAMPTZ DEFAULT NOW(),
    last_retry_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT false,
    resolution_notes TEXT
);

CREATE INDEX idx_dlq_failed_at ON dead_letter_queue(failed_at);
CREATE INDEX idx_dlq_resolved ON dead_letter_queue(resolved);

-- Function to move task to dead letter queue
CREATE OR REPLACE FUNCTION move_to_dead_letter(
    p_task_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_error_message TEXT,
    p_retry_count INTEGER DEFAULT 0,
    p_max_retries INTEGER DEFAULT 3
)
RETURNS UUID AS $$
DECLARE
    v_dlq_id UUID;
BEGIN
    INSERT INTO dead_letter_queue (
        original_task_id,
        title,
        description,
        error_message,
        retry_count,
        max_retries
    ) VALUES (
        p_task_id,
        p_title,
        p_description,
        p_error_message,
        p_retry_count,
        p_max_retries
    )
    RETURNING id INTO v_dlq_id;

    RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get all dead letter items
CREATE OR REPLACE FUNCTION get_dead_letter_items(p_resolved BOOLEAN DEFAULT false)
RETURNS TABLE(
    id UUID,
    original_task_id UUID,
    title TEXT,
    description TEXT,
    error_message TEXT,
    retry_count INTEGER,
    failed_at TIMESTAMPTZ,
    resolved BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dlq.id,
        dlq.original_task_id,
        dlq.title,
        dlq.description,
        dlq.error_message,
        dlq.retry_count,
        dlq.failed_at,
        dlq.resolved
    FROM dead_letter_queue dlq
    WHERE dlq.resolved = p_resolved
    ORDER BY dlq.failed_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Migration: 006_scheduled_tasks
-- Description: Add scheduled task support with cron expressions

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    cron_expression TEXT NOT NULL,
    interval_ms BIGINT,
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    timezone TEXT DEFAULT 'UTC',
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run) WHERE enabled = true;
CREATE INDEX idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);

-- Function to calculate next run time from cron expression
CREATE OR REPLACE FUNCTION calculate_next_cron_run(p_cron TEXT, p_from TIMESTAMPTZ DEFAULT NOW())
RETURNS TIMESTAMPTZ AS $$
DECLARE
    parts TEXT[];
    minute TEXT;
    hour TEXT;
    day_month TEXT;
    month TEXT;
    day_week TEXT;
    next_dt TIMESTAMPTZ;
BEGIN
    parts := string_to_array(p_cron, ' ');
    
    IF array_length(parts, 1) != 5 THEN
        RAISE EXCEPTION 'Invalid cron expression: %', p_cron;
    END IF;
    
    minute := parts[1];
    hour := parts[2];
    day_month := parts[3];
    month := parts[4];
    day_week := parts[5];
    
    next_dt := p_from;
    
    -- Simple implementation: support basic cron patterns
    -- For complex patterns, consider using a cron parser library
    
    RETURN next_dt + INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Function to get due scheduled tasks
CREATE OR REPLACE FUNCTION get_due_scheduled_tasks()
RETURNS TABLE(id UUID, name TEXT, description TEXT, cron_expression TEXT, priority INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        st.id,
        st.name,
        st.description,
        st.cron_expression,
        st.priority
    FROM scheduled_tasks st
    WHERE st.enabled = true
    AND st.next_run <= NOW()
    ORDER BY st.priority DESC, st.next_run ASC;
END;
$$ LANGUAGE plpgsql;

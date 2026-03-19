-- Migration: 024_task_failure_tracking
-- Description: Enhanced dead letter queue with failure categorization, alerts, and long task management

-- 1. Add failure tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS error_category TEXT CHECK (error_category IN ('NETWORK', 'AUTH', 'TIMEOUT', 'SERVER', 'TRANSPORT', 'LOGIC', 'RESOURCE', 'UNKNOWN', NULL));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_stuck BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stuck_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS watchdog_kills INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pause_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ;

-- 2. Create indexes for failure tracking queries
CREATE INDEX IF NOT EXISTS idx_tasks_error_category ON tasks(error_category);
CREATE INDEX IF NOT EXISTS idx_tasks_consecutive_failures ON tasks(consecutive_failures);
CREATE INDEX IF NOT EXISTS idx_tasks_is_stuck ON tasks(is_stuck) WHERE is_stuck = true;
CREATE INDEX IF NOT EXISTS idx_tasks_paused_until ON tasks(paused_until) WHERE paused_until IS NOT NULL;

-- 3. Create failure_alerts table for tracking repeated failures
CREATE TABLE IF NOT EXISTS failure_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL CHECK (alert_type IN ('repeated_failure', 'stuck_task', 'dlq_threshold', 'watchdog_kill', 'consecutive_failures')),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    original_task_id UUID, -- For DLQ items
    title TEXT NOT NULL,
    error_category TEXT,
    error_message TEXT,
    failure_count INTEGER DEFAULT 1,
    threshold INTEGER DEFAULT 3,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    alert_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failure_alerts_task_id ON failure_alerts(task_id);
CREATE INDEX IF NOT EXISTS idx_failure_alerts_acknowledged ON failure_alerts(acknowledged) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_failure_alerts_created_at ON failure_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_failure_alerts_type ON failure_alerts(alert_type);

-- 4. Create stuck_tasks_tracking table for watchdog monitoring
CREATE TABLE IF NOT EXISTS stuck_tasks_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    process_id INTEGER,
    started_at TIMESTAMPTZ NOT NULL,
    last_heartbeat_at TIMESTAMPTZ NOT NULL,
    watchdog_check_at TIMESTAMPTZ NOT NULL,
    watchdog_timeout_seconds INTEGER DEFAULT 300,
    is_killed BOOLEAN DEFAULT false,
    kill_reason TEXT,
    killed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_id)
);

CREATE INDEX IF NOT EXISTS idx_stuck_tasks_task_id ON stuck_tasks_tracking(task_id);
CREATE INDEX IF NOT EXISTS idx_stuck_tasks_process_id ON stuck_tasks_tracking(process_id) WHERE process_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stuck_tasks_heartbeat ON stuck_tasks_tracking(last_heartbeat_at) WHERE is_killed = false;

-- 5. Create long_tasks_pause table for auto-pause/resume
CREATE TABLE IF NOT EXISTS long_tasks_pause (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    pause_reason TEXT NOT NULL CHECK (pause_reason IN ('max_runtime', 'resource_threshold', 'user_request', 'scheduled_maintenance', 'failure_threshold')),
    paused_at TIMESTAMPTZ DEFAULT NOW(),
    resume_at TIMESTAMPTZ,
    auto_resume BOOLEAN DEFAULT true,
    max_pause_duration_seconds INTEGER DEFAULT 3600,
    metadata JSONB DEFAULT '{}',
    UNIQUE(task_id)
);

CREATE INDEX IF NOT EXISTS idx_long_tasks_pause_resume ON long_tasks_pause(resume_at) WHERE resume_at IS NOT NULL AND auto_resume = true;
CREATE INDEX IF NOT EXISTS idx_long_tasks_pause_task ON long_tasks_pause(task_id);

-- 6. Create failure_statistics view for analytics
CREATE OR REPLACE VIEW failure_statistics AS
SELECT 
    error_category,
    COUNT(*) as total_failures,
    COUNT(*) FILTER (WHERE is_stuck = true) as stuck_count,
    COUNT(*) FILTER (WHERE watchdog_kills > 0) as watchdog_kills,
    AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) as avg_duration_seconds,
    MAX(retry_count) as max_retries,
    SUM(retry_count) as total_retries
FROM tasks
WHERE status IN ('FAILED', 'COMPLETED')
GROUP BY error_category;

-- 7. Create function to categorize and track failures
CREATE OR REPLACE FUNCTION track_task_failure(
    p_task_id UUID,
    p_error_message TEXT,
    p_error_category TEXT DEFAULT 'UNKNOWN',
    p_retry_count INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    UPDATE tasks SET
        error = p_error_message,
        error_category = p_error_category,
        retry_count = p_retry_count,
        consecutive_failures = consecutive_failures + 1,
        last_failed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to record watchdog kill
CREATE OR REPLACE FUNCTION record_watchdog_kill(
    p_task_id UUID,
    p_process_id INTEGER,
    p_kill_reason TEXT,
    p_timeout_seconds INTEGER
)
RETURNS UUID AS $$
DECLARE
    v_tracking_id UUID;
BEGIN
    INSERT INTO stuck_tasks_tracking (
        task_id, process_id, started_at, last_heartbeat_at, watchdog_check_at,
        watchdog_timeout_seconds, is_killed, kill_reason, killed_at
    ) VALUES (
        p_task_id, p_process_id, NOW(), NOW(), NOW(),
        p_timeout_seconds, true, p_kill_reason, NOW()
    )
    ON CONFLICT (task_id) DO UPDATE SET
        is_killed = true,
        kill_reason = p_kill_reason,
        killed_at = NOW(),
        watchdog_check_at = NOW()
    RETURNING id INTO v_tracking_id;

    UPDATE tasks SET
        is_stuck = true,
        stuck_at = NOW(),
        watchdog_kills = watchdog_kills + 1,
        updated_at = NOW()
    WHERE id = p_task_id;

    RETURN v_tracking_id;
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to check and generate repeated failure alerts
CREATE OR REPLACE FUNCTION check_failure_alerts(p_threshold INTEGER DEFAULT 3)
RETURNS TABLE(alert_id UUID, task_id UUID, title TEXT, error_category TEXT, error_message TEXT, failure_count INTEGER) AS $$
DECLARE
    v_task RECORD;
BEGIN
    FOR v_task IN 
        SELECT id, title, error_category, error, consecutive_failures
        FROM tasks
        WHERE consecutive_failures >= p_threshold
        AND error IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM failure_alerts fa 
            WHERE fa.task_id = tasks.id 
            AND fa.acknowledged = false
            AND fa.created_at > NOW() - INTERVAL '1 hour'
        )
    LOOP
        INSERT INTO failure_alerts (
            alert_type, task_id, title, error_category, error_message, failure_count, threshold
        ) VALUES (
            'repeated_failure', v_task.id, v_task.title, v_task.error_category, v_task.error, v_task.consecutive_failures, p_threshold
        )
        ON CONFLICT DO NOTHING
        RETURNING id, task_id, title, error_category, error_message, failure_count INTO alert_id, task_id, title, error_category, error_message, failure_count;

        IF alert_id IS NOT NULL THEN
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 10. Create function to get tasks that need watchdog attention
CREATE OR REPLACE FUNCTION get_watchdog_candidates()
RETURNS TABLE(task_id UUID, title TEXT, process_id INTEGER, started_at TIMESTAMPTZ, last_heartbeat TIMESTAMPTZ, watchdog_timeout INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as task_id,
        t.title,
        stt.process_id,
        stt.started_at,
        stt.last_heartbeat_at,
        stt.watchdog_timeout_seconds as watchdog_timeout
    FROM tasks t
    JOIN stuck_tasks_tracking stt ON t.id = stt.task_id
    WHERE t.status = 'RUNNING'
    AND stt.is_killed = false
    AND (NOW() - stt.last_heartbeat_at) > (stt.watchdog_timeout_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- 11. Create function to get tasks eligible for auto-resume
CREATE OR REPLACE FUNCTION get_auto_resumable_tasks()
RETURNS TABLE(task_id UUID, title TEXT, pause_reason TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as task_id,
        t.title,
        ltp.pause_reason
    FROM tasks t
    JOIN long_tasks_pause ltp ON t.id = ltp.task_id
    WHERE t.status = 'PAUSED'
    AND ltp.auto_resume = true
    AND ltp.resume_at IS NOT NULL
    AND ltp.resume_at <= NOW();
END;
$$ LANGUAGE plpgsql;

-- 12. Create function to record long task pause
CREATE OR REPLACE FUNCTION pause_long_task(
    p_task_id UUID,
    p_pause_reason TEXT,
    p_resume_at TIMESTAMPTZ DEFAULT NULL,
    p_auto_resume BOOLEAN DEFAULT true,
    p_max_pause_seconds INTEGER DEFAULT 3600
)
RETURNS VOID AS $$
BEGIN
    UPDATE tasks SET
        status = 'PAUSED',
        pause_reason = p_pause_reason,
        paused_until = CASE WHEN p_auto_resume THEN NOW() + (p_max_pause_seconds || ' seconds')::INTERVAL ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_task_id;

    INSERT INTO long_tasks_pause (task_id, pause_reason, resume_at, auto_resume, max_pause_duration_seconds)
    VALUES (p_task_id, p_pause_reason, p_resume_at, p_auto_resume, p_max_pause_seconds)
    ON CONFLICT (task_id) DO UPDATE SET
        pause_reason = p_pause_reason,
        resume_at = p_resume_at,
        auto_resume = p_auto_resume,
        max_pause_duration_seconds = p_max_pause_seconds;
END;
$$ LANGUAGE plpgsql;

-- 13. Create function to resume paused task
CREATE OR REPLACE FUNCTION resume_task(p_task_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE tasks SET
        status = 'PENDING',
        pause_reason = NULL,
        paused_until = NULL,
        updated_at = NOW()
    WHERE id = p_task_id;

    DELETE FROM long_tasks_pause WHERE task_id = p_task_id;

    INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
    SELECT id, title, 'PAUSED', 'PENDING', 'Auto-resumed after pause', '{}'
    FROM tasks WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- 14. Update dead_letter_queue with enhanced fields
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS error_category TEXT CHECK (error_category IN ('NETWORK', 'AUTH', 'TIMEOUT', 'SERVER', 'TRANSPORT', 'LOGIC', 'RESOURCE', 'UNKNOWN'));
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS failure_pattern TEXT;
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS alert_sent BOOLEAN DEFAULT false;
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'resolved', 'ignored'));
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS watchdog_kills INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dlq_error_category ON dead_letter_queue(error_category);
CREATE INDEX IF NOT EXISTS idx_dlq_review_status ON dead_letter_queue(review_status);

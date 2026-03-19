-- Migration: 026_process_pid_tracking
-- Description: Track spawned process PIDs for proper cleanup

CREATE TABLE IF NOT EXISTS process_pids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Process info
    pid INTEGER NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Process metadata
    command TEXT NOT NULL,
    args JSONB DEFAULT '[]',
    working_dir TEXT,
    
    -- Timing
    spawned_at TIMESTAMPTZ DEFAULT NOW(),
    terminated_at TIMESTAMPTZ,
    
    -- Status
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'terminated', 'orphaned', 'zombie')),
    
    -- Parent tracking (for process groups)
    parent_pid INTEGER,
    process_group INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_process_pids_pid ON process_pids(pid);
CREATE INDEX IF NOT EXISTS idx_process_pids_task_id ON process_pids(task_id);
CREATE INDEX IF NOT EXISTS idx_process_pids_status ON process_pids(status);
CREATE INDEX IF NOT EXISTS idx_process_pids_spawned ON process_pids(spawned_at);
CREATE INDEX IF NOT EXISTS idx_process_pids_parent_pid ON process_pids(parent_pid);

-- Function to record a spawned process
CREATE OR REPLACE FUNCTION record_spawned_process(
    p_pid INTEGER,
    p_task_id UUID,
    p_command TEXT,
    p_args JSONB DEFAULT '[]'::jsonb,
    p_working_dir TEXT DEFAULT NULL,
    p_parent_pid INTEGER DEFAULT NULL,
    p_process_group INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO process_pids (
        id, pid, task_id, command, args, working_dir,
        parent_pid, process_group, spawned_at, status
    ) VALUES (
        uuid_generate_v4(), p_pid, p_task_id, p_command, p_args, p_working_dir,
        p_parent_pid, p_process_group, NOW(), 'running'
    )
    ON CONFLICT (task_id) DO UPDATE SET
        pid = p_pid,
        command = p_command,
        args = p_args,
        spawned_at = NOW(),
        status = 'running',
        terminated_at = NULL
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark process as terminated
CREATE OR REPLACE FUNCTION mark_process_terminated(
    p_pid INTEGER,
    p_status TEXT DEFAULT 'terminated'
)
RETURNS VOID AS $$
BEGIN
    UPDATE process_pids
    SET status = p_status,
        terminated_at = NOW()
    WHERE pid = p_pid AND status = 'running';
END;
$$ LANGUAGE plpgsql;

-- Function to find orphaned processes (running > threshold)
CREATE OR REPLACE FUNCTION find_orphaned_processes(
    p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
    id UUID,
    pid INTEGER,
    task_id UUID,
    command TEXT,
    spawned_at TIMESTAMPTZ,
    age_minutes INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pp.id,
        pp.pid,
        pp.task_id,
        pp.command,
        pp.spawned_at,
        EXTRACT(EPOCH FROM (NOW() - pp.spawned_at)) / 60::INTEGER as age_minutes
    FROM process_pids pp
    WHERE pp.status = 'running'
      AND pp.spawned_at < NOW() - (p_threshold_minutes || ' minutes')::INTERVAL
    ORDER BY pp.spawned_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup zombie processes
CREATE OR REPLACE FUNCTION cleanup_zombie_processes()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE process_pids
    SET status = 'zombie'
    WHERE status = 'running'
      AND pid NOT IN (SELECT pid FROM pg_stat_activity WHERE state = 'active')
      AND spawned_at < NOW() - INTERVAL '5 minutes';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-mark terminated processes
CREATE OR REPLACE FUNCTION check_process_alive()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'running' THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_stat_activity 
            WHERE pid = NEW.pid AND state = 'active'
        ) THEN
            UPDATE process_pids
            SET status = 'zombie',
                terminated_at = NOW()
            WHERE pid = NEW.pid;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- View for active processes
CREATE OR REPLACE VIEW active_processes AS
SELECT 
    pp.id,
    pp.pid,
    pp.task_id,
    t.title as task_title,
    t.status as task_status,
    pp.command,
    pp.spawned_at,
    EXTRACT(EPOCH FROM (NOW() - pp.spawned_at)) / 60 as age_minutes,
    pp.status
FROM process_pids pp
LEFT JOIN tasks t ON pp.task_id = t.id
WHERE pp.status = 'running'
ORDER BY pp.spawned_at ASC;

-- View for orphaned processes summary
CREATE OR REPLACE VIEW orphaned_processes_summary AS
SELECT 
    COUNT(*) as orphaned_count,
    COUNT(DISTINCT task_id) as affected_tasks,
    MIN(spawned_at) as oldest_orphan,
    MAX(spawned_at) as newest_orphan,
    array_agg(DISTINCT command) as commands
FROM process_pids
WHERE status = 'running'
  AND spawned_at < NOW() - INTERVAL '1 hour';

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

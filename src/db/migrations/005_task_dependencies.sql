-- Migration: 005_task_dependencies
-- Description: Add task dependency support (DAG-based execution)

-- Add depends_on column (array of UUIDs)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}';

-- Add blocking column (array of UUIDs - tasks this blocks)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocking UUID[] DEFAULT '{}';

-- Add indexes for dependency queries
CREATE INDEX IF NOT EXISTS idx_tasks_depends_on ON tasks USING GIN(depends_on);
CREATE INDEX IF NOT EXISTS idx_tasks_blocking ON tasks USING GIN(blocking);

-- Function to check if all dependencies are completed
CREATE OR REPLACE FUNCTION check_dependencies_completed(p_depends_on UUID[])
RETURNS BOOLEAN AS $$
BEGIN
    IF p_depends_on IS NULL OR array_length(p_depends_on, 1) IS NULL THEN
        RETURN TRUE;
    END IF;
    
    RETURN NOT EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = ANY(p_depends_on)
        AND t.status NOT IN ('COMPLETED')
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get blocked tasks (tasks whose dependencies just completed)
CREATE OR REPLACE FUNCTION get_blocked_tasks()
RETURNS TABLE(id UUID, title TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.title
    FROM tasks t
    WHERE t.status = 'PENDING'
    AND array_length(t.depends_on, 1) > 0
    AND check_dependencies_completed(t.depends_on);
END;
$$ LANGUAGE plpgsql;

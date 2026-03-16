-- Migration: 002_multi_project_support
-- Description: Add multi-project support for Nezha

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    path TEXT NOT NULL,
    language TEXT,
    framework TEXT,
    config JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_qc_at TIMESTAMPTZ,
    
    CONSTRAINT valid_path CHECK (path ~ '^/')
);

-- Add project_id to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Add project_id to memory table (already exists, but ensure foreign key)
ALTER TABLE memory ADD CONSTRAINT IF NOT EXISTS fk_memory_project 
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Project quality metrics table
CREATE TABLE IF NOT EXISTS project_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_value JSONB NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_metric_type CHECK (metric_type IN (
        'test_coverage',
        'code_quality',
        'documentation',
        'type_safety',
        'security',
        'performance',
        'custom'
    ))
);

-- Project communication log
CREATE TABLE IF NOT EXISTS project_communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_ai TEXT NOT NULL,
    to_ai TEXT,
    message_type TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    
    CONSTRAINT valid_message_type CHECK (message_type IN (
        'task',
        'review',
        'feedback',
        'status',
        'question',
        'answer',
        'notification'
    ))
);

-- Project configuration history
CREATE TABLE IF NOT EXISTS project_config_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    config JSONB NOT NULL,
    changed_by TEXT,
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for multi-project support
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_priority ON tasks(project_id, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

CREATE INDEX IF NOT EXISTS idx_project_metrics_project_id ON project_metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_project_metrics_type ON project_metrics(project_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_project_metrics_recorded_at ON project_metrics(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_communications_project_id ON project_communications(project_id);
CREATE INDEX IF NOT EXISTS idx_project_communications_created_at ON project_communications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_communications_unread ON project_communications(project_id, read_at) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_config_history_project_id ON project_config_history(project_id);
CREATE INDEX IF NOT EXISTS idx_project_config_history_created_at ON project_config_history(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get project statistics
CREATE OR REPLACE FUNCTION get_project_stats(p_project_id UUID)
RETURNS TABLE (
    total_tasks BIGINT,
    pending_tasks BIGINT,
    completed_tasks BIGINT,
    failed_tasks BIGINT,
    avg_priority NUMERIC,
    last_task_created TIMESTAMPTZ,
    last_task_completed TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_tasks,
        COUNT(*) FILTER (WHERE status = 'PENDING')::BIGINT as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::BIGINT as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'FAILED')::BIGINT as failed_tasks,
        COALESCE(AVG(priority), 0)::NUMERIC as avg_priority,
        MAX(created_at) as last_task_created,
        MAX(completed_at) as last_task_completed
    FROM tasks
    WHERE project_id = p_project_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread messages for a project
CREATE OR REPLACE FUNCTION get_unread_messages(p_project_id UUID)
RETURNS TABLE (
    id UUID,
    from_ai TEXT,
    message_type TEXT,
    content TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id,
        pc.from_ai,
        pc.message_type,
        pc.content,
        pc.created_at
    FROM project_communications pc
    WHERE pc.project_id = p_project_id
      AND pc.read_at IS NULL
    ORDER BY pc.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to mark message as read
CREATE OR REPLACE FUNCTION mark_message_read(p_message_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE project_communications
    SET read_at = NOW()
    WHERE id = p_message_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add project communication
CREATE OR REPLACE FUNCTION add_project_communication(
    p_project_id UUID,
    p_from_ai TEXT,
    p_to_ai TEXT,
    p_message_type TEXT,
    p_content TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO project_communications (
        project_id, from_ai, to_ai, message_type, content, metadata
    ) VALUES (
        p_project_id, p_from_ai, p_to_ai, p_message_type, p_content, p_metadata
    ) RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

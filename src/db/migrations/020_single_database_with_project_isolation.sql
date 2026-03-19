-- Migration: 020_single_database_with_project_isolation
-- Description: Refactor to single database with project_id for all tables
--              Add conversations table with project_id, implement RLS for isolation
--              Enable cross-project learning for AI to learn from ALL projects

-- Enable RLS extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CONVERSATIONS TABLE (moved from file-based)
-- =============================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    conversation_type TEXT NOT NULL DEFAULT 'task_execution' CHECK (conversation_type IN ('task_execution', 'problem_solving', 'learning', 'review')),
    title TEXT NOT NULL,
    participants TEXT[] DEFAULT '{}',
    messages JSONB DEFAULT '[]',
    result JSONB,
    success BOOLEAN,
    duration_ms INTEGER,
    tokens_used INTEGER,
    model TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_task_id ON conversations(task_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);

-- =============================================
-- ROW-LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on tasks table
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Enable RLS on memory table  
ALTER TABLE memory ENABLE ROW LEVEL SECURITY;

-- Enable RLS on conversations table
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for project isolation

-- Tasks: Users can only see tasks in their project (or ALL for cross-project learning)
DROP POLICY IF EXISTS "tasks_project_isolation" ON tasks;
CREATE POLICY "tasks_project_isolation" ON tasks FOR ALL
    USING (
        project_id = current_setting('app.current_project_id', true)::UUID
        OR current_setting('app.current_project_id', true) = 'ALL'
    );

-- Memory: Users can only see memories in their project (or ALL for cross-project learning)
DROP POLICY IF EXISTS "memory_project_isolation" ON memory;
CREATE POLICY "memory_project_isolation" ON memory FOR ALL
    USING (
        project_id = current_setting('app.current_project_id', true)::UUID
        OR current_setting('app.current_project_id', true) = 'ALL'
    );

-- Conversations: Users can only see conversations in their project (or ALL for cross-project learning)
DROP POLICY IF EXISTS "conversations_project_isolation" ON conversations;
CREATE POLICY "conversations_project_isolation" ON conversations FOR ALL
    USING (
        project_id = current_setting('app.current_project_id', true)::UUID
        OR current_setting('app.current_project_id', true) = 'ALL'
    );

-- =============================================
-- CROSS-PROJECT LEARNING SUPPORT
-- =============================================

-- Function to set project context for RLS
-- Usage: SET LOCAL app.current_project_id = 'uuid-here' or SET LOCAL app.current_project_id = 'ALL'
CREATE OR REPLACE FUNCTION set_project_context(p_project_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_project_id', p_project_id::TEXT, false);
END;
$$ LANGUAGE plpgsql;

-- Function to enable cross-project learning (ALL projects)
CREATE OR REPLACE FUNCTION enable_cross_project_learning()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_project_id', 'ALL', false);
END;
$$ LANGUAGE plpgsql;

-- Function to disable cross-project learning (current project only)
CREATE OR REPLACE FUNCTION disable_cross_project_learning()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_project_id', NULL, false);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- LEARNING FUNCTIONS (for AI to learn from ALL projects)
-- =============================================

-- Function to search memories across ALL projects (for learning)
CREATE OR REPLACE FUNCTION search_all_project_memories(
    p_query TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    content TEXT,
    metadata JSONB,
    tags TEXT[],
    importance INTEGER,
    source TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Enable cross-project learning mode temporarily
    PERFORM enable_cross_project_learning();
    
    RETURN QUERY
    SELECT 
        m.id,
        m.project_id,
        m.content,
        m.metadata,
        m.tags,
        m.importance,
        m.source,
        m.created_at,
        m.updated_at
    FROM memory m
    WHERE m.content ILIKE '%' || p_query || '%'
       OR m.tags && ARRAY[p_query]
    ORDER BY m.importance DESC, m.updated_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent learnings from ALL projects (for AI learning)
CREATE OR REPLACE FUNCTION get_cross_project_learnings(
    p_days INTEGER DEFAULT 7,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    content TEXT,
    metadata JSONB,
    tags TEXT[],
    importance INTEGER,
    source TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    PERFORM enable_cross_project_learning();
    
    RETURN QUERY
    SELECT 
        m.id,
        m.project_id,
        m.content,
        m.metadata,
        m.tags,
        m.importance,
        m.source,
        m.created_at
    FROM memory m
    WHERE m.created_at >= NOW() - (p_days || ' days')::INTERVAL
      AND (m.source LIKE '%learning%' OR m.tags && ARRAY['learning', 'insight', 'improvement'])
    ORDER BY m.importance DESC, m.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to save learning with cross-project awareness
CREATE OR REPLACE FUNCTION save_cross_project_learning(
    p_content TEXT,
    p_project_id UUID DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}',
    p_importance INTEGER DEFAULT 5,
    p_source TEXT DEFAULT 'cross-project-learning',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    -- If no project_id provided, don't associate with any project (global learning)
    INSERT INTO memory (id, project_id, content, tags, importance, source, metadata)
    VALUES (uuid_generate_v4(), p_project_id, p_content, p_tags, p_importance, p_source, p_metadata)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TASK HELPERS WITH PROJECT CONTEXT
-- =============================================

-- Function to create task with project context
CREATE OR REPLACE FUNCTION create_task_with_project(
    p_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_project_id UUID,
    p_data JSONB DEFAULT '{}',
    p_priority INTEGER DEFAULT 0,
    p_max_retries INTEGER DEFAULT 3
)
RETURNS UUID AS $$
BEGIN
    INSERT INTO tasks (id, title, description, project_id, data, priority, max_retries)
    VALUES (p_id, p_title, p_description, p_project_id, p_data, p_priority, p_max_retries)
    ON CONFLICT (id) DO UPDATE SET
        title = p_title,
        description = p_description,
        project_id = p_project_id,
        data = p_data,
        priority = p_priority;
    
    RETURN p_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at on conversations
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_updated_at();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
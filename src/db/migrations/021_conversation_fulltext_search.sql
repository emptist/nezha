-- Migration: 021_conversation_fulltext_search
-- Description: Add full-text search capability to conversations table
--              GIN index for fast text search, tsvector for messages content
--              Add search_conversations helper function

-- Add tsvector column for full-text search on messages
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS messages_tsv tsvector;

-- Update trigger to keep tsvector in sync
CREATE OR REPLACE FUNCTION update_conversations_messages_tsv()
RETURNS TRIGGER AS $$
BEGIN
    NEW.messages_tsv = to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.messages::text, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversations_messages_tsv ON conversations;
CREATE TRIGGER update_conversations_messages_tsv
    BEFORE INSERT OR UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_messages_tsv();

-- Backfill existing rows
UPDATE conversations SET messages_tsv = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(messages::text, ''))
WHERE messages_tsv IS NULL;

-- Create GIN index for full-text search
DROP INDEX IF EXISTS idx_conversations_messages_tsv;
CREATE INDEX idx_conversations_messages_tsv ON conversations USING GIN (messages_tsv);

-- Composite index for date range queries
DROP INDEX IF EXISTS idx_conversations_created_at_success;
CREATE INDEX idx_conversations_created_at_success ON conversations(created_at DESC, success);

-- Index for status filtering (derived from success field)
DROP INDEX IF EXISTS idx_conversations_status;
CREATE INDEX idx_conversations_status ON conversations(created_at DESC) WHERE success IS NOT NULL;

-- Add title column update trigger if not exists
CREATE OR REPLACE FUNCTION update_conversations_title()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.title IS NULL OR NEW.title = '' THEN
        NEW.title = COALESCE(
            (NEW.messages->0->>'content')::text,
            LEFT(NEW.messages::text, 100),
            'Untitled Conversation'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversations_title ON conversations;
CREATE TRIGGER update_conversations_title
    BEFORE INSERT ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_title();

-- Full-text search function
CREATE OR REPLACE FUNCTION search_conversations(
    p_query TEXT,
    p_project_id UUID DEFAULT NULL,
    p_task_id UUID DEFAULT NULL,
    p_conversation_type TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    session_id UUID,
    task_id UUID,
    conversation_type TEXT,
    title TEXT,
    participants TEXT[],
    messages JSONB,
    result JSONB,
    success BOOLEAN,
    duration_ms INTEGER,
    tokens_used INTEGER,
    model TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.project_id,
        c.session_id,
        c.task_id,
        c.conversation_type,
        c.title,
        c.participants,
        c.messages,
        c.result,
        c.success,
        c.duration_ms,
        c.tokens_used,
        c.model,
        c.metadata,
        c.created_at,
        c.updated_at,
        ts_rank(c.messages_tsv, plainto_tsquery('english', p_query)) AS rank
    FROM conversations c
    WHERE (
        p_query IS NULL OR p_query = ''
        OR c.messages_tsv @@ plainto_tsquery('english', p_query)
        OR c.title ILIKE '%' || p_query || '%'
        OR c.messages::text ILIKE '%' || p_query || '%'
    )
    AND (p_project_id IS NULL OR c.project_id = p_project_id)
    AND (p_task_id IS NULL OR c.task_id = p_task_id)
    AND (p_conversation_type IS NULL OR c.conversation_type = p_conversation_type)
    AND (p_success IS NULL OR c.success = p_success)
    AND (p_start_date IS NULL OR c.created_at >= p_start_date)
    AND (p_end_date IS NULL OR c.created_at <= p_end_date)
    ORDER BY rank DESC, c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Helper function to get conversation stats by type
CREATE OR REPLACE FUNCTION get_conversation_stats(
    p_project_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    conversation_type TEXT,
    total_count BIGINT,
    success_count BIGINT,
    failure_count BIGINT,
    avg_duration_ms NUMERIC,
    total_tokens BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.conversation_type,
        COUNT(*)::BIGINT AS total_count,
        COUNT(*) FILTER (WHERE c.success = true)::BIGINT AS success_count,
        COUNT(*) FILTER (WHERE c.success = false)::BIGINT AS failure_count,
        AVG(c.duration_ms)::NUMERIC AS avg_duration_ms,
        SUM(c.tokens_used)::BIGINT AS total_tokens
    FROM conversations c
    WHERE (p_project_id IS NULL OR c.project_id = p_project_id)
      AND c.created_at >= p_start_date
      AND c.created_at <= p_end_date
    GROUP BY c.conversation_type;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

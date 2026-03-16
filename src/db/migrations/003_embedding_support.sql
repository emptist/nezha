-- Migration: 003_embedding_support
-- Description: Add embedding support for semantic search

-- Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to memory table
ALTER TABLE memory 
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Add metadata columns for better search
ALTER TABLE memory
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
ADD COLUMN IF NOT EXISTS source TEXT;

-- Create vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_memory_embedding ON memory 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_memory_tags ON memory USING GIN(tags);

-- Create index on importance
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory(importance DESC);

-- Create index on source
CREATE INDEX IF NOT EXISTS idx_memory_source ON memory(source);

-- Create combined index for filtered vector search
CREATE INDEX IF NOT EXISTS idx_memory_project_importance ON memory(project_id, importance DESC);

-- Function to search memories by vector similarity
CREATE OR REPLACE FUNCTION search_memories_by_vector(
    p_query_embedding vector(768),
    p_project_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    content TEXT,
    metadata JSONB,
    tags TEXT[],
    importance INTEGER,
    source TEXT,
    similarity FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.project_id,
        m.content,
        m.metadata,
        m.tags,
        m.importance,
        m.source,
        (1 - (m.embedding <=> p_query_embedding))::FLOAT as similarity,
        m.created_at
    FROM memory m
    WHERE 
        (p_project_id IS NULL OR m.project_id = p_project_id)
        AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
    ORDER BY m.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search memories by keyword (full-text search)
CREATE OR REPLACE FUNCTION search_memories_by_keyword(
    p_query TEXT,
    p_project_id UUID DEFAULT NULL,
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
    rank FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.project_id,
        m.content,
        m.metadata,
        m.tags,
        m.importance,
        m.source,
        ts_rank_cd(to_tsvector('english', m.content), plainto_tsquery('english', p_query))::FLOAT as rank,
        m.created_at
    FROM memory m
    WHERE 
        (p_project_id IS NULL OR m.project_id = p_project_id)
        AND to_tsvector('english', m.content) @@ plainto_tsquery('english', p_query)
    ORDER BY rank DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to hybrid search (vector + keyword)
CREATE OR REPLACE FUNCTION hybrid_search_memories(
    p_query TEXT,
    p_query_embedding vector(768),
    p_project_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_vector_weight FLOAT DEFAULT 0.7,
    p_keyword_weight FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    content TEXT,
    metadata JSONB,
    tags TEXT[],
    importance INTEGER,
    source TEXT,
    vector_similarity FLOAT,
    keyword_rank FLOAT,
    combined_score FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            m.id,
            m.project_id,
            m.content,
            m.metadata,
            m.tags,
            m.importance,
            m.source,
            (1 - (m.embedding <=> p_query_embedding))::FLOAT as vector_similarity,
            0.0::FLOAT as keyword_rank,
            m.created_at
        FROM memory m
        WHERE (p_project_id IS NULL OR m.project_id = p_project_id)
        ORDER BY m.embedding <=> p_query_embedding
        LIMIT p_limit * 2
    ),
    keyword_results AS (
        SELECT 
            m.id,
            m.project_id,
            m.content,
            m.metadata,
            m.tags,
            m.importance,
            m.source,
            0.0::FLOAT as vector_similarity,
            ts_rank_cd(to_tsvector('english', m.content), plainto_tsquery('english', p_query))::FLOAT as keyword_rank,
            m.created_at
        FROM memory m
        WHERE 
            (p_project_id IS NULL OR m.project_id = p_project_id)
            AND to_tsvector('english', m.content) @@ plainto_tsquery('english', p_query)
        ORDER BY keyword_rank DESC
        LIMIT p_limit * 2
    ),
    combined AS (
        SELECT * FROM vector_results
        UNION
        SELECT * FROM keyword_results
    )
    SELECT 
        c.id,
        c.project_id,
        c.content,
        c.metadata,
        c.tags,
        c.importance,
        c.source,
        c.vector_similarity,
        c.keyword_rank,
        (c.vector_similarity * p_vector_weight + c.keyword_rank * p_keyword_weight)::FLOAT as combined_score,
        c.created_at
    FROM combined c
    ORDER BY combined_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get memory statistics
CREATE OR REPLACE FUNCTION get_memory_stats(p_project_id UUID DEFAULT NULL)
RETURNS TABLE (
    total_memories BIGINT,
    memories_with_embeddings BIGINT,
    memories_with_tags BIGINT,
    avg_importance NUMERIC,
    oldest_memory TIMESTAMPTZ,
    newest_memory TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_memories,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL)::BIGINT as memories_with_embeddings,
        COUNT(*) FILTER (WHERE tags IS NOT NULL AND array_length(tags, 1) > 0)::BIGINT as memories_with_tags,
        COALESCE(AVG(importance), 0)::NUMERIC as avg_importance,
        MIN(created_at) as oldest_memory,
        MAX(created_at) as newest_memory
    FROM memory
    WHERE p_project_id IS NULL OR project_id = p_project_id;
END;
$$ LANGUAGE plpgsql;

-- Comment on new columns
COMMENT ON COLUMN memory.embedding IS 'Vector embedding for semantic search (768 dimensions from Ollama nomic-embed-text)';
COMMENT ON COLUMN memory.tags IS 'Array of tags for categorization and filtering';
COMMENT ON COLUMN memory.importance IS 'Importance score from 1-10 for prioritization';
COMMENT ON COLUMN memory.source IS 'Source of the memory (e.g., "user", "ai", "system")';

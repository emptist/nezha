-- Migration: 041_skill_vector_search
-- Description: Add pgvector embedding support to skills table for semantic search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column for semantic search
ALTER TABLE skills ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_skills_embedding ON skills 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add safety score column
ALTER TABLE skills ADD COLUMN IF NOT EXISTS safety_score INTEGER DEFAULT 0 CHECK (safety_score >= 0 AND safety_score <= 100);

-- Add status column
ALTER TABLE skills ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'installed', 'uninstalled'));

-- Add rating column
ALTER TABLE skills ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5);

-- Semantic search function
CREATE OR REPLACE FUNCTION search_skills_by_embedding(
    p_query_embedding vector(768),
    p_limit INTEGER DEFAULT 10,
    p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    category TEXT,
    tags TEXT[],
    safety_score INTEGER,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.description,
        s.category,
        s.tags,
        COALESCE(s.safety_score, 0) as safety_score,
        (1 - (s.embedding <=> p_query_embedding))::FLOAT as similarity
    FROM skills s
    WHERE s.embedding IS NOT NULL
      AND COALESCE(s.status, 'approved') = 'approved'
      AND COALESCE(s.safety_score, 0) >= 50
      AND (1 - (s.embedding <=> p_query_embedding)) >= p_threshold
    ORDER BY s.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Project-specific skills view
CREATE OR REPLACE VIEW project_skills AS
SELECT 
    id,
    project_id,
    name,
    description,
    category,
    tags,
    version,
    safety_score,
    rating,
    status
FROM skills
WHERE COALESCE(status, 'approved') = 'approved';

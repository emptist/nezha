-- Migration: 035_skill_enhanced_columns
-- Description: Add enhanced columns for skill search, categories, and pgvector embeddings

-- =============================================
-- ENHANCED COLUMNS FOR SKILL SYSTEM
-- =============================================

-- Category for organizing skills
ALTER TABLE skills ADD COLUMN IF NOT EXISTS category TEXT;

-- Content JSONB for rich skill content (instructions, examples, etc.)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS content JSONB DEFAULT '{}';

-- Trigger phrases for auto-matching
ALTER TABLE skills ADD COLUMN IF NOT EXISTS trigger_phrases TEXT[] DEFAULT '{}';

-- Anti-patterns to avoid triggering
ALTER TABLE skills ADD COLUMN IF NOT EXISTS anti_patterns TEXT[] DEFAULT '{}';

-- Quick start guide
ALTER TABLE skills ADD COLUMN IF NOT EXISTS quick_start TEXT;

-- Usage examples
ALTER TABLE skills ADD COLUMN IF NOT EXISTS examples TEXT[] DEFAULT '{}';

-- Emoji icon
ALTER TABLE skills ADD COLUMN IF NOT EXISTS emoji TEXT;

-- =============================================
-- PGVECTOR EMBEDDING FOR SEMANTIC SEARCH
-- =============================================

-- Add embedding column (vector size 768 for nomic-embed-text)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create IVFFlat index for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_skills_embedding ON skills 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- =============================================
-- UPDATED QUERIES
-- =============================================

-- Function to update skill embedding
CREATE OR REPLACE FUNCTION update_skill_embedding(p_skill_id UUID)
RETURNS void AS $$
DECLARE
    v_content TEXT;
BEGIN
    -- Combine name, description, instructions, and examples for embedding
    SELECT COALESCE(name, '') || ' ' || COALESCE(description, '') || ' ' || 
           COALESCE(instructions, '') || ' ' || 
           COALESCE(array_to_string(examples, ' '), '')
    INTO v_content
    FROM skills
    WHERE id = p_skill_id;
    
    -- Note: Actual embedding generation should happen in application code
    -- using the embedding provider (Ollama/Zhipu)
    -- This function is for manual/recovery purposes
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SEMANTIC SEARCH FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION search_skills_by_embedding(
    p_query_embedding vector(768),
    p_limit INTEGER DEFAULT 20,
    p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    category TEXT,
    tags TEXT[],
    rating NUMERIC,
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
        s.rating,
        s.safety_score,
        (1 - (s.embedding <=> p_query_embedding))::FLOAT as similarity
    FROM skills s
    WHERE s.embedding IS NOT NULL
      AND s.status = 'approved'
      AND s.is_enabled = TRUE
      AND s.safety_score >= 70
      AND (1 - (s.embedding <=> p_query_embedding)) >= p_threshold
    ORDER BY s.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- HYBRID SEARCH FUNCTION (vector + keyword)
-- =============================================

CREATE OR REPLACE FUNCTION search_skills_hybrid(
    p_query_embedding vector(768),
    p_keyword TEXT,
    p_limit INTEGER DEFAULT 20,
    p_vector_weight FLOAT DEFAULT 0.6
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    category TEXT,
    tags TEXT[],
    rating NUMERIC,
    safety_score INTEGER,
    combined_score FLOAT,
    vector_similarity FLOAT,
    keyword_rank INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH keyword_results AS (
        SELECT id, row_number() OVER (ORDER BY rating DESC) as rank
        FROM skills
        WHERE status = 'approved' 
          AND is_enabled = TRUE 
          AND safety_score >= 70
          AND (
              name ILIKE '%' || p_keyword || '%'
              OR description ILIKE '%' || p_keyword || '%'
              OR $2 && tags
          )
    ),
    vector_results AS (
        SELECT 
            id,
            (1 - (embedding <=> p_query_embedding))::FLOAT as similarity
        FROM skills
        WHERE embedding IS NOT NULL
          AND status = 'approved'
          AND is_enabled = TRUE
          AND safety_score >= 70
    )
    SELECT 
        s.id,
        s.name,
        s.description,
        s.category,
        s.tags,
        s.rating,
        s.safety_score,
        COALESCE(
            p_vector_weight * vr.similarity + 
            (1 - p_vector_weight) * (1.0 / kr.rank),
            vr.similarity
        )::FLOAT as combined_score,
        COALESCE(vr.similarity, 0)::FLOAT as vector_similarity,
        COALESCE(kr.rank, 999999) as keyword_rank
    FROM skills s
    LEFT JOIN vector_results vr ON s.id = vr.id
    LEFT JOIN keyword_results kr ON s.id = kr.id
    WHERE s.status = 'approved' 
      AND s.is_enabled = TRUE 
      AND s.safety_score >= 70
      AND (vr.id IS NOT NULL OR kr.id IS NOT NULL)
    ORDER BY combined_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SKILL VERSION ENHANCEMENTS
-- =============================================

-- Add embedding to skill_versions for version-specific search
ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Index for version embedding search
CREATE INDEX IF NOT EXISTS idx_skill_versions_embedding ON skill_versions 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);

-- =============================================
-- PROJECT-SPECIFIC SKILL QUERIES
-- =============================================

-- View: Skills available for a specific project
CREATE OR REPLACE VIEW project_skills AS
SELECT 
    s.id,
    s.project_id,
    s.name,
    s.description,
    s.category,
    s.tags,
    s.version,
    s.rating,
    s.safety_score,
    s.use_count,
    CASE 
        WHEN s.project_id IS NOT NULL THEN 'project'
        WHEN s.is_public THEN 'public'
        ELSE 'private'
    END as scope
FROM skills s
WHERE s.status = 'approved' AND s.is_enabled = TRUE AND s.safety_score >= 70;

-- =============================================
-- INDEXES FOR ENHANCED SEARCH
-- =============================================

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_trigger_phrases ON skills USING GIN(trigger_phrases);
CREATE INDEX IF NOT EXISTS idx_skills_embedding_null ON skills(project_id) WHERE embedding IS NULL;

-- =============================================
-- GRANT PERMISSIONS
-- =============================================

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

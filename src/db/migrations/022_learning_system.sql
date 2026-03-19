-- Migration: 022_learning_system
-- Description: PostgreSQL-powered learning system with task outcomes tracking,
--              pattern analysis, and knowledge graph

CREATE EXTENSION IF NOT EXISTS vector;

-- Table: task_outcomes - Store task execution outcomes for analysis
CREATE TABLE IF NOT EXISTS task_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID,
    task_type VARCHAR(50),
    task_description TEXT,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    error_category VARCHAR(100),
    solution_applied TEXT,
    solution_worked BOOLEAN,
    execution_time_ms INTEGER,
    attempts INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_outcomes_task_id ON task_outcomes(task_id);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_project ON task_outcomes(project_id);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_status ON task_outcomes(status);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_error_category ON task_outcomes(error_category);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_task_type ON task_outcomes(task_type);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_created ON task_outcomes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_solution_worked ON task_outcomes(solution_worked);

-- Table: task_patterns - Track successful/failed patterns for future reference
CREATE TABLE IF NOT EXISTS task_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    pattern_type VARCHAR(50) NOT NULL, -- 'success', 'failure', 'workaround'
    pattern_category VARCHAR(100) NOT NULL, -- 'typescript', 'docker', 'api', etc.
    pattern_content TEXT NOT NULL,
    pattern_context TEXT, -- When does this pattern apply?
    success_rate FLOAT DEFAULT 0.5, -- 0.0 to 1.0
    occurrence_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_confirmed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(768),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_task_patterns_project ON task_patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_task_patterns_type ON task_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_task_patterns_category ON task_patterns(pattern_category);
CREATE INDEX IF NOT EXISTS idx_task_patterns_success_rate ON task_patterns(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_task_patterns_active ON task_patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_task_patterns_embedding ON task_patterns USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_task_patterns_occurrence ON task_patterns(occurrence_count DESC);

-- Table: knowledge_links - Build knowledge graph connections between memories and patterns
CREATE TABLE IF NOT EXISTS knowledge_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_type VARCHAR(20) NOT NULL, -- 'memory', 'pattern', 'outcome'
    from_id UUID NOT NULL,
    to_type VARCHAR(20) NOT NULL,
    to_id UUID NOT NULL,
    relation VARCHAR(50) NOT NULL, -- 'relates-to', 'causes', 'solves', 'contradicts', 'improves'
    confidence FLOAT DEFAULT 0.5, -- 0.0 to 1.0
    context TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_type, from_id, to_type, to_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_from ON knowledge_links(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_to ON knowledge_links(to_type, to_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_relation ON knowledge_links(relation);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_confidence ON knowledge_links(confidence DESC);

-- Table: learning_insights - AI-generated insights and suggestions
CREATE TABLE IF NOT EXISTS learning_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    insight_type VARCHAR(50) NOT NULL, -- 'improvement', 'warning', 'pattern', 'recommendation'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    evidence JSONB DEFAULT '[]', -- Array of supporting data points
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    confidence FLOAT DEFAULT 0.5,
    is_applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_insights_project ON learning_insights(project_id);
CREATE INDEX IF NOT EXISTS idx_learning_insights_type ON learning_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_learning_insights_priority ON learning_insights(priority DESC);
CREATE INDEX IF NOT EXISTS idx_learning_insights_applied ON learning_insights(is_applied);
CREATE INDEX IF NOT EXISTS idx_learning_insights_expires ON learning_insights(expires_at) WHERE expires_at IS NOT NULL;

-- Table: task_outcome_features - Store extracted features for ML/analysis
CREATE TABLE IF NOT EXISTS task_outcome_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_id UUID NOT NULL REFERENCES task_outcomes(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    feature_value TEXT,
    feature_numeric FLOAT,
    feature_category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outcome_id, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_task_outcome_features_outcome ON task_outcome_features(outcome_id);
CREATE INDEX IF NOT EXISTS idx_task_outcome_features_name ON task_outcome_features(feature_name);
CREATE INDEX IF NOT EXISTS idx_task_outcome_features_category ON task_outcome_features(feature_category);

-- Function: Update task_patterns success rate based on recent outcomes
CREATE OR REPLACE FUNCTION update_pattern_success_rate(pattern_id UUID)
RETURNS VOID AS $$
DECLARE
    v_category VARCHAR(100);
    v_new_rate FLOAT;
BEGIN
    SELECT pattern_category INTO v_category FROM task_patterns WHERE id = pattern_id;
    
    SELECT 
        CASE 
            WHEN COUNT(*) FILTER (WHERE solution_worked = TRUE) = 0 AND COUNT(*) = 0 THEN 0.0
            WHEN COUNT(*) FILTER (WHERE solution_worked = TRUE) = 0 THEN 0.1
            ELSE COUNT(*) FILTER (WHERE solution_worked = TRUE)::FLOAT / COUNT(*)::FLOAT
        END INTO v_new_rate
    FROM task_outcomes
    WHERE error_category = v_category
      AND created_at >= NOW() - INTERVAL '30 days';
    
    UPDATE task_patterns
    SET success_rate = v_new_rate,
        last_seen_at = NOW()
    WHERE id = pattern_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-suggest improvements based on failure patterns
CREATE OR REPLACE FUNCTION suggest_improvements_from_failures(
    p_project_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    error_category VARCHAR(100),
    failure_count BIGINT,
    avg_execution_time_ms NUMERIC,
    suggested_improvement TEXT,
    confidence_score FLOAT,
    related_pattern_id UUID,
    related_memory_id UUID
) AS $$
BEGIN
    RETURN QUERY
    WITH recent_failures AS (
        SELECT 
            error_category,
            COUNT(*) as failure_count,
            AVG(execution_time_ms)::NUMERIC as avg_time,
            ARRAY_AGG(DISTINCT error_message) as error_messages
        FROM task_outcomes
        WHERE status = 'FAILED'
          AND created_at >= NOW() - INTERVAL '7 days'
          AND (p_project_id IS NULL OR project_id = p_project_id)
        GROUP BY error_category
        HAVING COUNT(*) >= 2
    ),
    best_patterns AS (
        SELECT 
            id,
            pattern_content,
            pattern_category,
            success_rate
        FROM task_patterns
        WHERE pattern_type = 'success'
          AND pattern_category = ANY(SELECT error_category FROM recent_failures)
          AND is_active = TRUE
        ORDER BY success_rate DESC
        LIMIT p_limit
    ),
    related_memories AS (
        SELECT 
            m.id,
            m.content,
            m.metadata
        FROM memory m
        WHERE m.embedding IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM recent_failures rf 
              WHERE m.content ILIKE '%' || rf.error_category || '%'
          )
        LIMIT p_limit
    )
    SELECT 
        rf.error_category,
        rf.failure_count,
        rf.avg_time,
        'Consider applying patterns with >70% success rate for ' || rf.error_category AS suggested_improvement,
        LEAST(1.0, rf.failure_count / 10.0)::FLOAT as confidence_score,
        bp.id as related_pattern_id,
        rm.id as related_memory_id
    FROM recent_failures rf
    LEFT JOIN LATERAL (
        SELECT id, pattern_content FROM best_patterns 
        WHERE pattern_category = rf.error_category 
        LIMIT 1
    ) bp ON TRUE
    LEFT JOIN LATERAL (
        SELECT id FROM related_memories LIMIT 1
    ) rm ON TRUE
    ORDER BY rf.failure_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Find similar successful solutions for a given problem
CREATE OR REPLACE FUNCTION find_similar_solutions(
    p_problem_description TEXT,
    p_problem_embedding VECTOR(768),
    p_project_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    outcome_id UUID,
    task_description TEXT,
    solution_applied TEXT,
    solution_worked BOOLEAN,
    similarity_score FLOAT,
    execution_time_ms INTEGER,
    attempts INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_.id,
        to_.task_description,
        to_.solution_applied,
        to_.solution_worked,
        (1 - (to_.embedding <=> p_problem_embedding))::FLOAT as similarity_score,
        to_.execution_time_ms,
        to_.attempts
    FROM (
        SELECT 
            id,
            task_description,
            solution_applied,
            solution_worked,
            execution_time_ms,
            attempts,
            embedding
        FROM task_outcomes
        WHERE solution_applied IS NOT NULL
          AND embedding IS NOT NULL
          AND (p_project_id IS NULL OR project_id = p_project_id)
          AND (1 - (embedding <=> p_problem_embedding)) >= 0.5
        ORDER BY embedding <=> p_problem_embedding
        LIMIT p_limit * 2
    ) to_
    WHERE to_.solution_worked = TRUE
    ORDER BY to_.embedding <=> p_problem_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Build knowledge graph connections automatically
CREATE OR REPLACE FUNCTION auto_build_knowledge_links()
RETURNS INTEGER AS $$
DECLARE
    v_link_count INTEGER := 0;
BEGIN
    -- Link memories that share similar tags or content
    INSERT INTO knowledge_links (from_type, from_id, to_type, to_id, relation, confidence, context)
    SELECT DISTINCT
        'memory'::VARCHAR(20),
        m1.id,
        'memory'::VARCHAR(20),
        m2.id,
        'relates-to'::VARCHAR(50),
        0.7,
        'Auto-linked: share ' || 
        (SELECT ARRAY_AGG(unnest) FROM (SELECT unnest(m1.tags) INTERSECT SELECT unnest(m2.tags)) t)::TEXT
    FROM memory m1
    JOIN memory m2 ON m1.id < m2.id
    WHERE m1.tags IS NOT NULL 
      AND m2.tags IS NOT NULL
      AND m1.tags && m2.tags
      AND NOT EXISTS (
          SELECT 1 FROM knowledge_links kl 
          WHERE kl.from_id = m1.id AND kl.to_id = m2.id
      )
    ON CONFLICT DO NOTHING
    GETTING v_link_count += 1;

    -- Link successful patterns to related memories
    INSERT INTO knowledge_links (from_type, from_id, to_type, to_id, relation, confidence, context)
    SELECT DISTINCT
        'pattern'::VARCHAR(20),
        tp.id,
        'memory'::VARCHAR(20),
        m.id,
        'confirms'::VARCHAR(50),
        tp.success_rate,
        'Pattern confirmed by memory'
    FROM task_patterns tp
    JOIN memory m ON m.embedding IS NOT NULL AND tp.embedding IS NOT NULL
    WHERE tp.is_active = TRUE
      AND tp.success_rate >= 0.7
      AND (1 - (tp.embedding <=> m.embedding)) >= 0.6
      AND NOT EXISTS (
          SELECT 1 FROM knowledge_links kl 
          WHERE kl.from_id = tp.id AND kl.to_id = m.id
      )
    ON CONFLICT DO NOTHING
    GETTING v_link_count += 1;

    RETURN v_link_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update task_outcomes.updated_at
CREATE OR REPLACE FUNCTION update_task_outcomes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_task_outcomes_updated
    BEFORE UPDATE ON task_outcomes
    FOR EACH ROW
    EXECUTE FUNCTION update_task_outcomes_timestamp();

-- Trigger: Update task_patterns.last_seen_at
CREATE OR REPLACE TRIGGER trigger_task_patterns_seen
    BEFORE UPDATE ON task_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_task_patterns_last_seen()
AS $$
BEGIN
    NEW.last_seen_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add embedding column to task_outcomes if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_outcomes' AND column_name = 'embedding') THEN
        ALTER TABLE task_outcomes ADD COLUMN embedding VECTOR(768);
        CREATE INDEX IF NOT EXISTS idx_task_outcomes_embedding ON task_outcomes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    END IF;
END $$;

COMMENT ON TABLE task_outcomes IS 'Stores task execution outcomes for pattern analysis and learning';
COMMENT ON TABLE task_patterns IS 'Tracks successful and failed patterns for future reference';
COMMENT ON TABLE knowledge_links IS 'Knowledge graph connections between memories, patterns, and outcomes';
COMMENT ON TABLE learning_insights IS 'AI-generated insights and improvement suggestions';
COMMENT ON TABLE task_outcome_features IS 'Extracted features from task outcomes for analysis';

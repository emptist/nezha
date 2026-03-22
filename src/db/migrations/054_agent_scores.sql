-- Migration: Agent Scoring System
-- Purpose: Track AI agent performance for smart session management

CREATE TABLE IF NOT EXISTS agent_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(100) NOT NULL UNIQUE,
    
    -- Performance metrics
    commits_count INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    tasks_failed INTEGER DEFAULT 0,
    meeting_contributions INTEGER DEFAULT 0,
    code_reviews INTEGER DEFAULT 0,
    
    -- Calculated score (cached for performance)
    composite_score DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Metadata
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_protected BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_agent_scores_agent_id ON agent_scores(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_scores_composite ON agent_scores(composite_score DESC);

-- Function to update composite score
CREATE OR REPLACE FUNCTION update_agent_composite_score(p_agent_id VARCHAR)
RETURNS DECIMAL AS $$
DECLARE
    v_score DECIMAL(10, 2);
BEGIN
    SELECT 
        (commits_count * 10) +
        (tasks_completed * 5) +
        (tasks_failed * -2) +
        (meeting_contributions * 3) +
        (code_reviews * 4)
    INTO v_score
    FROM agent_scores
    WHERE agent_id = p_agent_id;
    
    UPDATE agent_scores 
    SET composite_score = GREATEST(0, v_score),
        updated_at = NOW()
    WHERE agent_id = p_agent_id;
    
    RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp
CREATE OR REPLACE FUNCTION update_agent_scores_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_scores_timestamp
    BEFORE UPDATE ON agent_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_scores_timestamp();

-- Function to increment agent stats
CREATE OR REPLACE FUNCTION increment_agent_stat(
    p_agent_id VARCHAR,
    p_stat VARCHAR,
    p_increment INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO agent_scores (agent_id, first_seen, last_active)
    VALUES (p_agent_id, NOW(), NOW())
    ON CONFLICT (agent_id) DO UPDATE SET
        last_active = NOW();
    
    IF p_stat = 'commits' THEN
        UPDATE agent_scores SET commits_count = commits_count + p_increment WHERE agent_id = p_agent_id;
    ELSIF p_stat = 'tasks_completed' THEN
        UPDATE agent_scores SET tasks_completed = tasks_completed + p_increment WHERE agent_id = p_agent_id;
    ELSIF p_stat = 'tasks_failed' THEN
        UPDATE agent_scores SET tasks_failed = tasks_failed + p_increment WHERE agent_id = p_agent_id;
    ELSIF p_stat = 'meetings' THEN
        UPDATE agent_scores SET meeting_contributions = meeting_contributions + p_increment WHERE agent_id = p_agent_id;
    ELSIF p_stat = 'reviews' THEN
        UPDATE agent_scores SET code_reviews = code_reviews + p_increment WHERE agent_id = p_agent_id;
    END IF;
    
    PERFORM update_agent_composite_score(p_agent_id);
END;
$$ LANGUAGE plpgsql;

-- Function to get top agents
CREATE OR REPLACE FUNCTION get_top_agents(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    agent_id VARCHAR,
    composite_score DECIMAL,
    commits_count INTEGER,
    tasks_completed INTEGER,
    last_active TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.agent_id,
        a.composite_score,
        a.commits_count,
        a.tasks_completed,
        a.last_active
    FROM agent_scores a
    ORDER BY a.composite_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

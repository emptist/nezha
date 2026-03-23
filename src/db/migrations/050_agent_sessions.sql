-- Migration: 050_agent_sessions
-- Description: Add agent session tracking with bot_<uuid> identifiers

-- Agent Sessions table for tracking AI instances
CREATE TABLE IF NOT EXISTS agent_sessions (
    id VARCHAR(50) PRIMARY KEY,  -- 'bot_' + uuid
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'alive' CHECK (status IN ('alive', 'dead')),
    git_branch VARCHAR(100),
    working_on TEXT,
    agent_type VARCHAR(50) DEFAULT 'opencode',  -- opencode, trae, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add session_id to tasks table for attribution
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS session_id VARCHAR(50);

-- Add session_id to memory table for attribution
ALTER TABLE memory ADD COLUMN IF NOT EXISTS session_id VARCHAR(50);

-- Add session_id to inter_reviews table for attribution
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS session_id VARCHAR(50);

-- Indexes for session tracking
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_last_heartbeat ON agent_sessions(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_session_id ON memory(session_id);
CREATE INDEX IF NOT EXISTS idx_inter_reviews_session_id ON inter_reviews(session_id);

-- Function to generate bot_<uuid> ID
CREATE OR REPLACE FUNCTION generate_bot_id()
RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN 'bot_' || uuid_generate_v4()::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup stale sessions (called by heartbeat)
CREATE OR REPLACE FUNCTION cleanup_stale_sessions(interval_minutes INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE
    cleaned INTEGER;
BEGIN
    UPDATE agent_sessions 
    SET status = 'dead'
    WHERE status = 'alive' 
      AND last_heartbeat < NOW() - (interval_minutes || ' minutes')::INTERVAL;
    
    GET DIAGNOSTICS cleaned = ROW_COUNT;
    RETURN cleaned;
END;
$$ LANGUAGE plpgsql;

-- Function to permanently delete dead sessions older than specified hours
CREATE OR REPLACE FUNCTION cleanup_dead_sessions(age_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM agent_sessions 
    WHERE status = 'dead' 
      AND last_heartbeat < NOW() - (age_hours || ' hours')::INTERVAL;
    
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

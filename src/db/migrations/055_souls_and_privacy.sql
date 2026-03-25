-- Migration: 055_souls_and_privacy
-- Add souls table for AI personality/soul storage
-- Add privacy and viewers to learnings, issues, skills

-- Create souls table
CREATE TABLE IF NOT EXISTS souls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT,
  name TEXT,
  content TEXT,
  traits JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_souls_agent_id ON souls(agent_id);
CREATE INDEX IF NOT EXISTS idx_souls_name ON souls(name);

-- Add privacy and viewers to learnings
ALTER TABLE learnings 
  ADD COLUMN IF NOT EXISTS privacy TEXT DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS viewers TEXT[] DEFAULT '{}';

-- Add attribution to issues
ALTER TABLE issues 
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS viewers TEXT[] DEFAULT '{}';

-- Add attribution to skills
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS viewers TEXT[] DEFAULT '{}';

-- Add attribution to inter_reviews
ALTER TABLE inter_reviews
  ADD COLUMN IF NOT EXISTS created_by TEXT;

COMMENT ON TABLE souls IS 'AI soul/personality storage - inspired by SOUL.md pattern';
COMMENT ON COLUMN learnings.privacy IS 'private: creator only, shared: viewed by others, public: everyone';
COMMENT ON COLUMN learnings.viewers IS 'List of agent IDs who have viewed this learning';

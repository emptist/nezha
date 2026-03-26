-- Migration: 055_souls_and_privacy (updated)
-- Create souls table for AI personality/soul storage
-- Add viewers to existing tables

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

-- Add viewers to memory
ALTER TABLE memory 
  ADD COLUMN IF NOT EXISTS viewers TEXT[] DEFAULT '{}';

-- Add viewers to issues
ALTER TABLE issues 
  ADD COLUMN IF NOT EXISTS viewers TEXT[] DEFAULT '{}';

-- Add viewers to skills
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS viewers TEXT[] DEFAULT '{}';

COMMENT ON TABLE souls IS 'AI soul/personality storage - inspired by SOUL.md pattern';

-- Migration: Add AI ID tracking to tasks table
-- This adds agent_id, git_hash, git_branch, and environment columns to tasks

ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS agent_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS git_hash TEXT,
  ADD COLUMN IF NOT EXISTS git_branch TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'development';

CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_git_hash ON tasks(git_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_environment ON tasks(environment);

COMMENT ON COLUMN tasks.agent_id IS 'UUID of the AI agent that processed this task';
COMMENT ON COLUMN tasks.agent_name IS 'Display name of the AI agent (if set)';
COMMENT ON COLUMN tasks.git_hash IS 'Git commit hash when task was processed';
COMMENT ON COLUMN tasks.git_branch IS 'Git branch when task was processed';
COMMENT ON COLUMN tasks.environment IS 'Environment (development/production/test) when task was processed';

-- Add constraint to prevent fake completions
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS valid_completion;
ALTER TABLE tasks ADD CONSTRAINT valid_completion 
  CHECK (status != 'COMPLETED' OR result IS NOT NULL OR completed_at IS NOT NULL);

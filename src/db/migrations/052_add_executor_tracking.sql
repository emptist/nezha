-- Add executor tracking columns to tasks table
-- This allows us to track which AI actually executed the task,
-- not just which daemon picked it up

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_type VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_model VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_provider VARCHAR(50);

-- Add comment
COMMENT ON COLUMN tasks.executor_type IS 'Type of AI that executed the task (opencode, trae, claude, etc.)';
COMMENT ON COLUMN tasks.executor_model IS 'Specific model used (big-pickle, claude-3-opus, etc.)';
COMMENT ON COLUMN tasks.executor_provider IS 'Provider of the AI (opencode, anthropic, openai, etc.)';

-- Create index for querying by executor
CREATE INDEX IF NOT EXISTS idx_tasks_executor_type ON tasks(executor_type);
CREATE INDEX IF NOT EXISTS idx_tasks_executor_model ON tasks(executor_model);

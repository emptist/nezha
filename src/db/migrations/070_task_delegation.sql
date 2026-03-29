-- Add delegation support for AI-to-AI task escalation
-- delegate_to: which AI should handle this task (null = any)
-- complexity: estimated task complexity (1-5)
-- delegated_from: which AI originally received the task but delegated it
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delegate_to VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS complexity INTEGER DEFAULT 3 CHECK (complexity >= 1 AND complexity <= 5);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delegated_from VARCHAR(50);

-- Index for finding delegated tasks quickly
CREATE INDEX IF NOT EXISTS idx_tasks_delegate_to ON tasks(delegate_to) WHERE delegate_to IS NOT NULL;

-- Add priority boost for delegated tasks (they should be handled faster)
-- Will be used in task selection queries

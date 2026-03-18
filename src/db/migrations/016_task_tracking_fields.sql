-- Migration: 016_task_tracking_fields
-- Description: Add type and assigned_to columns for enhanced task tracking

-- Add task type column
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('analysis', 'implementation', 'documentation', 'bugfix', 'research', 'testing', 'deployment', 'maintenance')) DEFAULT 'implementation';

-- Add assigned_to column (for future multi-agent/human assignment)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- Update default type for existing tasks
UPDATE tasks SET type = 'implementation' WHERE type IS NULL;
-- Migration: 053_fix_task_type_column
-- Description: Ensure type column exists in tasks table
-- Date: 2026-03-24

-- Add type column if missing (with IF NOT EXISTS for safety)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'implementation';

-- Also ensure category column exists
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);

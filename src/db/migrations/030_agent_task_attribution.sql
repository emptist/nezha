-- Migration: 030_agent_task_attribution
-- Description: Add created_by column to tasks for agent attribution
-- Date: 2026-03-20

-- Add created_by column to track which agent created each task
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'nezha-daemon';

-- Add index for efficient querying by agent
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

-- Create agent_identity table for multi-agent scenarios
CREATE TABLE IF NOT EXISTS agent_identity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT UNIQUE NOT NULL,
    display_name TEXT,
    description TEXT,
    capabilities TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Insert this agent's identity
INSERT INTO agent_identity (agent_name, display_name, description, capabilities)
VALUES (
    'nezha-daemon',
    'Nezha Daemon',
    'Primary autonomous AI agent for continuous task execution',
    ARRAY['task_execution', 'code_review', 'learning', 'self_improvement']
)
ON CONFLICT (agent_name) DO NOTHING;

-- Add agent_id to memory table for tracking which agent saved memories
ALTER TABLE memory
ADD COLUMN IF NOT EXISTS agent_id TEXT DEFAULT 'nezha-daemon';

CREATE INDEX IF NOT EXISTS idx_memory_agent_id ON memory(agent_id);

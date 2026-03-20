-- Migration: 030_agent_task_attribution
-- Description: Add UUID-based agent attribution
-- Date: 2026-03-20

-- Add created_by column to track which agent (by UUID) created each task
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add index for efficient querying by agent
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

-- Create agent_identity table for multi-agent scenarios
-- Note: agent_name is now the UUID for stability across restarts
CREATE TABLE IF NOT EXISTS agent_identity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name UUID UNIQUE NOT NULL,
    display_name TEXT,
    description TEXT,
    capabilities TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Add agent_id to memory table for tracking which agent saved memories
ALTER TABLE memory
ADD COLUMN IF NOT EXISTS agent_id UUID;

CREATE INDEX IF NOT EXISTS idx_memory_agent_id ON memory(agent_id);

-- Function to register agent on startup
CREATE OR REPLACE FUNCTION register_agent(
    p_agent_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_capabilities TEXT[] DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO agent_identity (agent_name, display_name, description, capabilities)
    VALUES (p_agent_id, p_display_name, p_description, p_capabilities)
    ON CONFLICT (agent_name) DO UPDATE SET
        last_seen_at = NOW(),
        display_name = COALESCE(p_display_name, agent_identity.display_name),
        description = COALESCE(p_description, agent_identity.description),
        capabilities = COALESCE(p_capabilities, agent_identity.capabilities)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

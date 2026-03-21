-- Migration: 051_fix_agent_identity
-- Description: Fix agent_identity table schema mismatch
-- Date: 2026-03-22

-- Add missing columns from migration 030
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS agent_name UUID UNIQUE;
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS capabilities TEXT[];
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS description TEXT;

-- Make project_id nullable (for non-project agents)
ALTER TABLE agent_identity ALTER COLUMN project_id DROP NOT NULL;

-- Update register_agent function to work with merged schema
CREATE OR REPLACE FUNCTION register_agent(
    p_agent_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_capabilities TEXT[] DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_background TEXT DEFAULT NULL,
    p_expertise JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO agent_identity (agent_name, display_name, description, capabilities, role, background, expertise)
    VALUES (p_agent_id, p_display_name, p_description, p_capabilities, p_role, p_background, p_expertise)
    ON CONFLICT (agent_name) DO UPDATE SET
        last_seen_at = NOW(),
        display_name = COALESCE(p_display_name, agent_identity.display_name),
        description = COALESCE(p_description, agent_identity.description),
        capabilities = COALESCE(p_capabilities, agent_identity.capabilities),
        role = COALESCE(p_role, agent_identity.role),
        background = COALESCE(p_background, agent_identity.background),
        expertise = COALESCE(p_expertise, agent_identity.expertise)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

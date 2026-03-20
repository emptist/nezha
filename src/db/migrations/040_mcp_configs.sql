-- Migration: 040_mcp_configs.sql
-- Purpose: Store MCP server configurations in database (PostgreSQL-first principle)
-- 
-- Design Rationale:
-- - All operational configs should be in PostgreSQL for queryability and sync
-- - MCP configs define which tools are available to AI agents
-- - Keeping this in DB allows easy management and version control

-- ============================================================
-- MCP Server Configurations Table
-- ============================================================
CREATE TABLE IF NOT EXISTS mcp_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Server identity
    name TEXT NOT NULL UNIQUE,  -- e.g., 'nezha-learning'
    
    -- Server type: 'local' or 'remote'
    server_type TEXT NOT NULL CHECK (server_type IN ('local', 'remote')),
    
    -- Local server config
    command TEXT,           -- e.g., 'node' (only for local)
    command_args TEXT[],    -- e.g., ['dist/mcp/learning-server.js']
    
    -- Remote server config
    url TEXT,               -- e.g., 'https://mcp.example.com' (only for remote)
    headers JSONB DEFAULT '{}',  -- Custom headers for remote servers
    
    -- OAuth config (for remote servers)
    oauth_enabled BOOLEAN DEFAULT false,
    oauth_config JSONB,    -- { clientId, clientSecret, scope }
    
    -- General settings
    enabled BOOLEAN DEFAULT true,
    timeout_ms INTEGER DEFAULT 5000,
    environment JSONB DEFAULT '{}',  -- Environment variables
    
    -- Metadata
    description TEXT,       -- Human-readable description
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_mcp_configs_name ON mcp_configs(name);
CREATE INDEX IF NOT EXISTS idx_mcp_configs_enabled ON mcp_configs(enabled);

-- ============================================================
-- MCP Tool Definitions Table
-- ============================================================
-- Tracks which tools each MCP server exposes
CREATE TABLE IF NOT EXISTS mcp_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_name TEXT NOT NULL REFERENCES mcp_configs(name) ON DELETE CASCADE,
    
    -- Tool identity
    tool_name TEXT NOT NULL,
    description TEXT,
    
    -- Input schema (JSON Schema)
    input_schema JSONB,
    
    -- Tool metadata
    tags TEXT[] DEFAULT '{}',
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(server_name, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server_name);

-- ============================================================
-- Trigger: Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_mcp_configs_updated_at
    BEFORE UPDATE ON mcp_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Helper Functions
-- ============================================================

-- Get all enabled MCP configs
CREATE OR REPLACE FUNCTION get_enabled_mcp_configs()
RETURNS TABLE (
    name TEXT,
    server_type TEXT,
    command TEXT,
    command_args TEXT[],
    url TEXT,
    enabled BOOLEAN,
    timeout_ms INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.name,
        m.server_type,
        m.command,
        m.command_args,
        m.url,
        m.enabled,
        m.timeout_ms
    FROM mcp_configs m
    WHERE m.enabled = true
    ORDER BY m.name;
END;
$$ LANGUAGE plpgsql;

-- Add or update MCP config (upsert)
CREATE OR REPLACE FUNCTION upsert_mcp_config(
    p_name TEXT,
    p_server_type TEXT,
    p_command TEXT DEFAULT NULL,
    p_command_args TEXT[] DEFAULT NULL,
    p_url TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO mcp_configs (name, server_type, command, command_args, url, description)
    VALUES (p_name, p_server_type, p_command, p_command_args, p_url, p_description)
    ON CONFLICT (name) DO UPDATE SET
        server_type = EXCLUDED.server_type,
        command = EXCLUDED.command,
        command_args = EXCLUDED.command_args,
        url = EXCLUDED.url,
        description = EXCLUDED.description,
        updated_at = NOW(),
        version = mcp_configs.version + 1
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Seed Data: Default MCP configs for Nezha
-- ============================================================

-- Nezha Learning MCP Server (local)
INSERT INTO mcp_configs (name, server_type, command, command_args, description)
VALUES (
    'nezha-learning',
    'local',
    'node',
    ARRAY['dist/mcp/learning-server.js'],
    'Nezha learning tools: learn(), memory_search(), suggest_prompt_update(). Enables AI to save learnings and search memory.'
)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE mcp_configs IS 'MCP server configurations - PostgreSQL-first storage per design philosophy';
COMMENT ON COLUMN mcp_configs.name IS 'Unique server name (e.g., nezha-learning)';
COMMENT ON COLUMN mcp_configs.server_type IS 'Type: local (stdio) or remote (HTTP)';
COMMENT ON COLUMN mcp_configs.command IS 'Executable command for local servers (e.g., node, npx)';
COMMENT ON COLUMN mcp_configs.command_args IS 'Command arguments (e.g., [dist/mcp/learning-server.js])';
COMMENT ON COLUMN mcp_configs.url IS 'Remote MCP server URL';
COMMENT ON COLUMN mcp_configs.headers IS 'Custom HTTP headers for remote servers';
COMMENT ON COLUMN mcp_configs.oauth_enabled IS 'Enable OAuth for remote servers';
COMMENT ON COLUMN mcp_configs.enabled IS 'Whether this MCP server is active';
COMMENT ON COLUMN mcp_configs.timeout_ms IS 'Timeout for fetching tools (default 5000ms)';
COMMENT ON COLUMN mcp_configs.environment IS 'Environment variables for local servers';

COMMENT ON TABLE mcp_tools IS 'MCP tool definitions - what each server exposes';
COMMENT ON COLUMN mcp_tools.server_name IS 'References mcp_configs.name';
COMMENT ON COLUMN mcp_tools.tool_name IS 'Tool name as exposed by MCP server';
COMMENT ON COLUMN mcp_tools.input_schema IS 'JSON Schema for tool input parameters';

-- ============================================================
-- Documentation Comments
-- ============================================================
COMMENT ON FUNCTION get_enabled_mcp_configs IS 
'Returns all enabled MCP server configurations for tool registration';
COMMENT ON FUNCTION upsert_mcp_config IS 
'Upsert MCP config - inserts new or updates existing by name';

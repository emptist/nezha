-- Migration: 002_agent_identities
-- Description: Create agent identities table for Agent ID System
-- Date: 2026-03-25

-- Agent Identities table - stores the identity registry
CREATE TABLE IF NOT EXISTS agent_identities (
    id VARCHAR(100) PRIMARY KEY,                    -- Semantic ID: {project}-{git-hash}-{timestamp}
    project VARCHAR(255),                           -- Project name
    git_hash VARCHAR(20),                           -- Git short hash
    machine_fingerprint VARCHAR(64),                -- Machine fingerprint (fallback)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata
    display_name VARCHAR(255),
    description TEXT,
    owner VARCHAR(255),
    
    -- Constraints
    UNIQUE(project, git_hash)                      -- Same project+git = same identity
);

-- Indexes for fast matching
CREATE INDEX IF NOT EXISTS idx_agent_identities_project ON agent_identities(project);
CREATE INDEX IF NOT EXISTS idx_agent_identities_git_hash ON agent_identities(git_hash);
CREATE INDEX IF NOT EXISTS idx_agent_identities_machine ON agent_identities(machine_fingerprint);
CREATE INDEX IF NOT EXISTS idx_agent_identities_created_at ON agent_identities(created_at DESC);

-- Agent Sessions table - tracks active sessions
CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_id VARCHAR(100) REFERENCES agent_identities(id) ON DELETE SET NULL,
    agent_type VARCHAR(50) NOT NULL,                -- 'opencode', 'trae', 'daemon', etc.
    process_id INTEGER,
    working_on UUID REFERENCES tasks(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'alive' CHECK (status IN ('alive', 'dead', 'sleeping')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for session management
CREATE INDEX IF NOT EXISTS idx_agent_sessions_identity ON agent_sessions(identity_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_type ON agent_sessions(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_heartbeat ON agent_sessions(last_heartbeat DESC);

-- Update tasks table to reference identity
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_identity VARCHAR(100) REFERENCES agent_identities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_identity ON tasks(created_by_identity);

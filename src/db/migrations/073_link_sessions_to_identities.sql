-- Add identity_id column to agent_sessions to link sessions to semantic identities
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS identity_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_identity_id ON agent_sessions(identity_id);

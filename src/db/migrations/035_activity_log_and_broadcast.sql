-- Migration: 035_activity_log_and_broadcast
-- Description: Add activity logging and broadcast support for AI traceability
-- Date: 2026-03-20

-- Activity log table for AI activity tracking
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL,
    activity TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    git_hash TEXT,
    git_branch TEXT,
    environment TEXT DEFAULT 'development',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_activity ON activity_log(activity);

-- Add message_type to project_communications if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_communications' AND column_name = 'message_type'
    ) THEN
        ALTER TABLE project_communications ADD COLUMN message_type TEXT DEFAULT 'notification';
    END IF;
END $$;

-- Add metadata to project_communications for broadcasts
ALTER TABLE project_communications ALTER COLUMN metadata TYPE JSONB USING metadata::jsonb;

COMMENT ON TABLE activity_log IS 'AI activity tracking with git hash and environment context';

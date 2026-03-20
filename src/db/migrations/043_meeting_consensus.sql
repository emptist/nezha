-- Migration: 043_meeting_consensus
-- Description: Add proper meetings table with consensus support

CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    consensus TEXT,
    consensus_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS meeting_opinions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    perspective TEXT NOT NULL,
    reasoning TEXT,
    position TEXT CHECK (position IN ('support', 'oppose', 'neutral')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created ON meetings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_opinions_meeting ON meeting_opinions(meeting_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_meeting_opinions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_meeting_opinions_timestamp ON meeting_opinions;
CREATE TRIGGER update_meeting_opinions_timestamp
    BEFORE UPDATE ON meeting_opinions
    FOR EACH ROW EXECUTE FUNCTION update_meeting_opinions_timestamp();

-- Link discussions table to meetings
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES meetings(id);

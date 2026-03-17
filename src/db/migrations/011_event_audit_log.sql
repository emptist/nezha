-- Migration: 011_event_audit_log
-- Description: Add event audit log table for event-driven architecture

-- Create event_log table for audit trail
CREATE TABLE IF NOT EXISTS event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_log_type ON event_log(event_type);
CREATE INDEX idx_event_log_created ON event_log(created_at DESC);

-- Function to clean old events (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_events(p_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
BEGIN
    DELETE FROM event_log 
    WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
    GET DIAGNOSTICS p_days = ROW_COUNT;
    RETURN p_days;
END;
$$ LANGUAGE plpgsql;

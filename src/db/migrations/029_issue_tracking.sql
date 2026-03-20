-- Migration: 029_issue_tracking
-- Description: Issue tracking system for system bugs, inconsistencies, and improvement ideas

CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Issue classification
    title TEXT NOT NULL,
    description TEXT,
    issue_type TEXT NOT NULL DEFAULT 'bug' CHECK (issue_type IN (
        'bug',           -- System bug or broken functionality
        'inconsistency', -- Doc/code mismatch
        'feature',       -- New feature request
        'improvement',   -- Enhancement idea
        'question',      -- Needs clarification
        'debt'           -- Technical debt
    )),
    severity TEXT DEFAULT 'medium' CHECK (severity IN (
        'critical', -- System broken, blocks work
        'high',     -- Major functionality impaired
        'medium',   -- Moderate impact
        'low',      -- Minor impact, nice to fix
        'cosmetic'  -- No functional impact
    )),
    status TEXT DEFAULT 'open' CHECK (status IN (
        'open',         -- Not yet addressed
        'acknowledged', -- Triaged, planned
        'in_progress',  -- Being worked on
        'resolved',     -- Fixed/implemented
        'wont_fix',     -- Deliberately not fixing
        'duplicate'     -- Duplicate of existing issue
    )),
    
    -- Source tracking
    discovered_by TEXT DEFAULT 'nezha',  -- Which agent/system found it
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Relationships
    related_issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    
    -- Resolution
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    
    -- Tags for filtering
    tags TEXT[] DEFAULT '{}',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_issues_type ON issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_discovered_by ON issues(discovered_by);
CREATE INDEX IF NOT EXISTS idx_issues_tags ON issues USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at DESC);

-- Function to create an issue
CREATE OR REPLACE FUNCTION create_issue(
    p_title TEXT,
    p_description TEXT,
    p_issue_type TEXT DEFAULT 'bug',
    p_severity TEXT DEFAULT 'medium',
    p_discovered_by TEXT DEFAULT 'nezha',
    p_tags TEXT[] DEFAULT '{}',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO issues (title, description, issue_type, severity, discovered_by, tags, metadata)
    VALUES (p_title, p_description, p_issue_type, p_severity, p_discovered_by, p_tags, p_metadata)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update issue status
CREATE OR REPLACE FUNCTION update_issue_status(
    p_id UUID,
    p_status TEXT,
    p_resolution TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE issues SET
        status = p_status,
        resolution = CASE WHEN p_status IN ('resolved', 'wont_fix', 'duplicate') 
                         THEN COALESCE(p_resolution, resolution) 
                         ELSE resolution END,
        resolved_at = CASE WHEN p_status IN ('resolved', 'wont_fix', 'duplicate') 
                          THEN NOW() 
                          ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Function to link related issues
CREATE OR REPLACE FUNCTION link_issues(
    p_issue_id UUID,
    p_related_issue_id UUID,
    p_link_type TEXT DEFAULT 'relates'
)
RETURNS VOID AS $$
BEGIN
    -- Set related_issue_id on primary issue
    UPDATE issues SET related_issue_id = p_related_issue_id WHERE id = p_issue_id;
END;
$$ LANGUAGE plpgsql;

-- View: Open issues by severity
CREATE OR REPLACE VIEW issues_by_severity AS
SELECT 
    severity,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE status = 'open') as open_count,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
    COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count
FROM issues
GROUP BY severity
ORDER BY 
    CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
        WHEN 'cosmetic' THEN 5 
    END;

-- View: Recent issues
CREATE OR REPLACE VIEW recent_issues AS
SELECT 
    id,
    title,
    issue_type,
    severity,
    status,
    discovered_by,
    created_at,
    EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as age_hours
FROM issues
ORDER BY created_at DESC
LIMIT 50;

-- View: Issue statistics
CREATE OR REPLACE VIEW issue_stats AS
SELECT 
    COUNT(*) as total_issues,
    COUNT(*) FILTER (WHERE status = 'open') as open_issues,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
    COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '7 days') as new_this_week,
    COUNT(*) FILTER (WHERE resolved_at > NOW() - INTERVAL '7 days') as resolved_this_week,
    ROUND(
        COUNT(*) FILTER (WHERE status = 'resolved')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 1
    ) as resolution_rate_percent
FROM issues;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_issue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_issue_updated
    BEFORE UPDATE ON issues
    FOR EACH ROW
    EXECUTE FUNCTION update_issue_timestamp();

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

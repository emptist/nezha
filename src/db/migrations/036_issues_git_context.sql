-- Migration: Update issues functions for git and environment context
-- This updates the create_issue function to include git_hash, git_branch, and environment

-- Drop and recreate create_issue function with new parameters
DROP FUNCTION IF EXISTS create_issue(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB);

CREATE OR REPLACE FUNCTION create_issue(
    p_title TEXT,
    p_description TEXT,
    p_issue_type TEXT DEFAULT 'bug',
    p_severity TEXT DEFAULT 'medium',
    p_discovered_by TEXT DEFAULT 'nezha',
    p_tags TEXT[] DEFAULT '{}',
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_git_hash TEXT DEFAULT NULL,
    p_git_branch TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT 'development'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO issues (
        title, description, issue_type, severity, discovered_by, tags, metadata,
        git_hash, git_branch, environment
    )
    VALUES (
        p_title, p_description, p_issue_type, p_severity, p_discovered_by, p_tags, p_metadata,
        p_git_hash, p_git_branch, p_environment
    )
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Update the recent_issues view to include git info
DROP VIEW IF EXISTS recent_issues;
CREATE OR REPLACE VIEW recent_issues AS
SELECT 
    id,
    title,
    issue_type,
    severity,
    status,
    discovered_by,
    created_at,
    git_hash,
    git_branch,
    environment,
    EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as age_hours
FROM issues
ORDER BY created_at DESC
LIMIT 50;

-- Add a new function to find issues by git hash
CREATE OR REPLACE FUNCTION find_issues_by_git_hash(
    p_git_hash TEXT
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    issue_type TEXT,
    severity TEXT,
    status TEXT,
    environment TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.title,
        i.issue_type,
        i.severity,
        i.status,
        i.environment
    FROM issues i
    WHERE i.git_hash = p_git_hash
    ORDER BY i.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Add a function to find issues by environment
CREATE OR REPLACE FUNCTION find_issues_by_environment(
    p_environment TEXT,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    issue_type TEXT,
    severity TEXT,
    status TEXT,
    git_hash TEXT,
    git_branch TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.title,
        i.issue_type,
        i.severity,
        i.status,
        i.git_hash,
        i.git_branch
    FROM issues i
    WHERE i.environment = p_environment
    ORDER BY i.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_issue IS 'Creates a new issue with git and environment context';
COMMENT ON FUNCTION find_issues_by_git_hash IS 'Finds all issues discovered at a specific git commit';
COMMENT ON FUNCTION find_issues_by_environment IS 'Finds issues discovered in a specific environment';

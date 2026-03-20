-- Migration: 040_github_like_features
-- Description: Add GitHub-like features to issues and reviews

-- 1. Add assignee to issues
ALTER TABLE issues ADD COLUMN IF NOT EXISTS assignee TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS assignee_type TEXT DEFAULT 'agent' CHECK (assignee_type IN ('agent', 'human', 'system'));
CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee);

-- 2. Add labels table (separate from tags)
CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#666666',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Link issues to labels
CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by TEXT,
    PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_labels_issue ON issue_labels(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_labels_label ON issue_labels(label_id);

-- 4. Add milestones table
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- 5. Add milestone to issues
ALTER TABLE issues ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_issues_milestone ON issues(milestone_id);

-- 6. Issue comments/discussion
CREATE TABLE IF NOT EXISTS issue_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    author_type TEXT DEFAULT 'agent' CHECK (author_type IN ('agent', 'human', 'system')),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_author ON issue_comments(author);
CREATE INDEX IF NOT EXISTS idx_issue_comments_created ON issue_comments(created_at DESC);

-- 7. Issue events/audit trail
CREATE TABLE IF NOT EXISTS issue_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    actor_type TEXT DEFAULT 'agent' CHECK (actor_type IN ('agent', 'human', 'system')),
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_issue_events_issue ON issue_events(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_events_type ON issue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_issue_events_created ON issue_events(created_at DESC);

-- 8. Add git_hash/git_branch to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS git_hash TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS git_branch TEXT;
CREATE INDEX IF NOT EXISTS idx_reviews_git_hash ON reviews(git_hash);
CREATE INDEX IF NOT EXISTS idx_reviews_git_branch ON reviews(git_branch);

-- 9. Link between reviews and issues
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS related_issue_id UUID REFERENCES issues(id) ON DELETE SET NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS related_review_id UUID REFERENCES reviews(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_issue ON reviews(related_issue_id);
CREATE INDEX IF NOT EXISTS idx_issues_review ON issues(related_review_id);

-- 10. Review comments
CREATE TABLE IF NOT EXISTS review_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    author_type TEXT DEFAULT 'agent' CHECK (author_type IN ('agent', 'human', 'system')),
    body TEXT NOT NULL,
    file_path TEXT,
    line_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_review_comments_review ON review_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_author ON review_comments(author);
CREATE INDEX IF NOT EXISTS idx_review_comments_created ON review_comments(created_at DESC);

-- 11. Functions for issue management

-- Add comment to issue
CREATE OR REPLACE FUNCTION add_issue_comment(
    p_issue_id UUID,
    p_author TEXT,
    p_body TEXT,
    p_author_type TEXT DEFAULT 'agent'
)
RETURNS UUID AS $$
DECLARE
    v_comment_id UUID;
BEGIN
    INSERT INTO issue_comments (issue_id, author, body, author_type)
    VALUES (p_issue_id, p_author, p_body, p_author_type)
    RETURNING id INTO v_comment_id;
    
    -- Add event
    INSERT INTO issue_events (issue_id, event_type, actor, actor_type, new_value)
    VALUES (p_issue_id, 'commented', p_author, p_author_type, p_body);
    
    RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql;

-- Assign issue
CREATE OR REPLACE FUNCTION assign_issue(
    p_issue_id UUID,
    p_assignee TEXT,
    p_assignee_type TEXT DEFAULT 'agent',
    p_actor TEXT DEFAULT 'system'
)
RETURNS VOID AS $$
DECLARE
    v_old_assignee TEXT;
BEGIN
    SELECT assignee INTO v_old_assignee FROM issues WHERE id = p_issue_id;
    
    UPDATE issues SET assignee = p_assignee, assignee_type = p_assignee_type, updated_at = NOW()
    WHERE id = p_issue_id;
    
    INSERT INTO issue_events (issue_id, event_type, actor, old_value, new_value)
    VALUES (p_issue_id, 'assigned', p_actor, v_old_assignee, p_assignee);
END;
$$ LANGUAGE plpgsql;

-- Add label to issue
CREATE OR REPLACE FUNCTION add_issue_label(
    p_issue_id UUID,
    p_label_name TEXT,
    p_actor TEXT DEFAULT 'system'
)
RETURNS VOID AS $$
DECLARE
    v_label_id UUID;
BEGIN
    -- Get or create label
    INSERT INTO labels (name) VALUES (p_label_name)
    ON CONFLICT (name) DO NOTHING;
    
    SELECT id INTO v_label_id FROM labels WHERE name = p_label_name;
    
    -- Add label to issue
    INSERT INTO issue_labels (issue_id, label_id, added_by)
    VALUES (p_issue_id, v_label_id, p_actor)
    ON CONFLICT DO NOTHING;
    
    -- Add event
    INSERT INTO issue_events (issue_id, event_type, actor, new_value)
    VALUES (p_issue_id, 'labeled', p_actor, p_label_name);
END;
$$ LANGUAGE plpgsql;

-- Create milestone
CREATE OR REPLACE FUNCTION create_milestone(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_due_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO milestones (title, description, due_date)
    VALUES (p_title, p_description, p_due_date)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Set issue milestone
CREATE OR REPLACE FUNCTION set_issue_milestone(
    p_issue_id UUID,
    p_milestone_id UUID,
    p_actor TEXT DEFAULT 'system'
)
RETURNS VOID AS $$
DECLARE
    v_old_milestone_id UUID;
    v_old_title TEXT;
    v_new_title TEXT;
BEGIN
    SELECT milestone_id INTO v_old_milestone_id FROM issues WHERE id = p_issue_id;
    
    UPDATE issues SET milestone_id = p_milestone_id, updated_at = NOW()
    WHERE id = p_issue_id;
    
    IF v_old_milestone_id IS NOT NULL THEN
        SELECT title INTO v_old_title FROM milestones WHERE id = v_old_milestone_id;
    END IF;
    
    IF p_milestone_id IS NOT NULL THEN
        SELECT title INTO v_new_title FROM milestones WHERE id = p_milestone_id;
    END IF;
    
    INSERT INTO issue_events (issue_id, event_type, actor, old_value, new_value)
    VALUES (p_issue_id, 'milestoned', p_actor, v_old_title, v_new_title);
END;
$$ LANGUAGE plpgsql;

-- Link review to issue
CREATE OR REPLACE FUNCTION link_review_to_issue(
    p_review_id UUID,
    p_issue_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE reviews SET related_issue_id = p_issue_id WHERE id = p_review_id;
    UPDATE issues SET related_review_id = p_review_id WHERE id = p_issue_id;
    
    INSERT INTO issue_events (issue_id, event_type, actor, new_value)
    VALUES (p_issue_id, 'linked', 'system', 'review:' || p_review_id::TEXT);
END;
$$ LANGUAGE plpgsql;

-- 12. Views for GitHub-like display

-- Issue with labels view
CREATE OR REPLACE VIEW issues_with_labels AS
SELECT 
    i.*,
    array_agg(DISTINCT l.name) FILTER (WHERE l.name IS NOT NULL) as label_names,
    array_agg(DISTINCT l.color) FILTER (WHERE l.color IS NOT NULL) as label_colors,
    m.title as milestone_title,
    m.due_date as milestone_due,
    (SELECT COUNT(*) FROM issue_comments WHERE issue_id = i.id) as comment_count
FROM issues i
LEFT JOIN issue_labels il ON i.id = il.issue_id
LEFT JOIN labels l ON il.label_id = l.id
LEFT JOIN milestones m ON i.milestone_id = m.id
GROUP BY i.id, m.title, m.due_date;

-- Issue timeline view
CREATE OR REPLACE VIEW issue_timeline AS
SELECT 
    ie.id,
    ie.issue_id,
    ie.event_type,
    ie.actor,
    ie.actor_type,
    ie.old_value,
    ie.new_value,
    ie.created_at,
    i.title as issue_title
FROM issue_events ie
JOIN issues i ON ie.issue_id = i.id
ORDER BY ie.created_at DESC;

-- Milestone progress view
CREATE OR REPLACE VIEW milestone_progress AS
SELECT 
    m.id,
    m.title,
    m.due_date,
    m.status,
    COUNT(i.id) as total_issues,
    COUNT(i.id) FILTER (WHERE i.status = 'closed' OR i.status = 'resolved') as closed_issues,
    ROUND(
        COUNT(i.id) FILTER (WHERE i.status IN ('closed', 'resolved'))::numeric / 
        NULLIF(COUNT(i.id), 0) * 100, 1
    ) as completion_percent
FROM milestones m
LEFT JOIN issues i ON i.milestone_id = m.id
GROUP BY m.id, m.title, m.due_date, m.status
ORDER BY m.due_date NULLS LAST;

-- Insert default labels
INSERT INTO labels (name, color, description) VALUES
    ('bug', '#d73a4a', 'Something isn''t working'),
    ('enhancement', '#a2eeef', 'New feature or request'),
    ('documentation', '#0075ca', 'Improvements or additions to documentation'),
    ('good first issue', '#7057ff', 'Good for newcomers'),
    ('help wanted', '#008672', 'Extra attention is needed'),
    ('question', '#d876e3', 'Further information is requested'),
    ('wontfix', '#ffffff', 'This will not be worked on'),
    ('critical', '#b60205', 'Critical priority'),
    ('high-priority', '#d93f0b', 'High priority')
ON CONFLICT (name) DO NOTHING;

-- Trigger for comment updated_at
CREATE OR REPLACE FUNCTION update_comment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_issue_comment_updated
    BEFORE UPDATE ON issue_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_comment_timestamp();

CREATE TRIGGER trigger_review_comment_updated
    BEFORE UPDATE ON review_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_comment_timestamp();

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

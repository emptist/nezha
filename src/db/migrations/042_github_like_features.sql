-- Migration: 042_github_like_features
-- Description: Add GitHub-like features to issues and reviews

-- =============================================
-- ISSUE COMMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS issue_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_created ON issue_comments(created_at DESC);

-- =============================================
-- ISSUE EVENTS (Audit Trail)
-- =============================================
CREATE TABLE IF NOT EXISTS issue_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'created', 'status_changed', 'severity_changed', 'assigned', 
        'unassigned', 'labeled', 'unlabeled', 'milestoned', 'unmilestoned',
        'commented', 'linked', 'unlinked', 'closed', 'reopened'
    )),
    actor TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_events_issue_id ON issue_events(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_events_type ON issue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_issue_events_created ON issue_events(created_at DESC);

-- =============================================
-- REVIEW COMMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS review_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES inter_reviews(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    file_path TEXT,
    line_number INTEGER,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_comments_review_id ON review_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_resolved ON review_comments(is_resolved);

-- =============================================
-- LABELS (separate from tags)
-- =============================================
CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'gray',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labels_name ON labels(name);

-- Issue labels junction table
CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

-- Review labels junction table
CREATE TABLE IF NOT EXISTS review_labels (
    review_id UUID REFERENCES inter_reviews(id) ON DELETE CASCADE,
    label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (review_id, label_id)
);

-- =============================================
-- MILESTONES
-- =============================================
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due ON milestones(due_date);

-- =============================================
-- ENHANCED COLUMNS
-- =============================================

-- Add to issues
ALTER TABLE issues ADD COLUMN IF NOT EXISTS assignee TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS review_id UUID REFERENCES inter_reviews(id);

-- Add to inter_reviews
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES issues(id);
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS git_hash TEXT;
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS git_branch TEXT;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Log issue event
CREATE OR REPLACE FUNCTION log_issue_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO issue_events (issue_id, event_type, actor, new_value)
        VALUES (NEW.id, 'created', NEW.discovered_by, NEW.status);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO issue_events (issue_id, event_type, actor, old_value, new_value)
            VALUES (NEW.id, 
                CASE 
                    WHEN NEW.status = 'resolved' THEN 'closed'
                    WHEN NEW.status = 'open' AND OLD.status = 'resolved' THEN 'reopened'
                    ELSE 'status_changed'
                END,
                COALESCE(NEW.resolved_by, 'system'),
                OLD.status, NEW.status);
        END IF;
        IF OLD.assignee IS DISTINCT FROM NEW.assignee THEN
            IF NEW.assignee IS NOT NULL THEN
                INSERT INTO issue_events (issue_id, event_type, actor, new_value)
                VALUES (NEW.id, 'assigned', COALESCE(NEW.resolved_by, 'system'), NEW.assignee);
            ELSE
                INSERT INTO issue_events (issue_id, event_type, actor, old_value)
                VALUES (NEW.id, 'unassigned', COALESCE(NEW.resolved_by, 'system'), OLD.assignee);
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_issue_event ON issues;
CREATE TRIGGER log_issue_event
    AFTER INSERT OR UPDATE ON issues
    FOR EACH ROW EXECUTE FUNCTION log_issue_event();

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_comments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_issue_comments_timestamp ON issue_comments;
CREATE TRIGGER update_issue_comments_timestamp
    BEFORE UPDATE ON issue_comments
    FOR EACH ROW EXECUTE FUNCTION update_comments_timestamp();

DROP TRIGGER IF EXISTS update_review_comments_timestamp ON review_comments;
CREATE TRIGGER update_review_comments_timestamp
    BEFORE UPDATE ON review_comments
    FOR EACH ROW EXECUTE FUNCTION update_comments_timestamp();

DROP TRIGGER IF EXISTS update_milestones_timestamp ON milestones;
CREATE TRIGGER update_milestones_timestamp
    BEFORE UPDATE ON milestones
    FOR EACH ROW EXECUTE FUNCTION update_comments_timestamp();

-- =============================================
-- SEED DATA: Default Labels
-- =============================================
INSERT INTO labels (name, color, description) VALUES
    ('bug', 'red', 'Something is not working'),
    ('enhancement', 'green', 'New feature or request'),
    ('documentation', 'blue', 'Improvements to documentation'),
    ('help wanted', 'orange', 'Extra attention is needed'),
    ('good first issue', 'purple', 'Good for newcomers'),
    ('wontfix', 'gray', 'This will not be worked on')
ON CONFLICT (name) DO NOTHING;

-- Migration: 022_skill_registry
-- Description: Comprehensive skill registry with assessment, approval, and control fields

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- SKILLS TABLE (ClawHub integration + assessment)
-- =============================================
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Identity
    name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'clawhub' CHECK (source IN ('clawhub', 'local', 'generated', 'imported')),
    external_id TEXT UNIQUE,
    version TEXT NOT NULL DEFAULT '1.0.0',
    
    -- Metadata
    description TEXT,
    author TEXT,
    repository TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Assessment (auto-filled by SkillReviewer)
    safety_score INTEGER DEFAULT 0 CHECK (safety_score >= 0 AND safety_score <= 100),
    scan_status TEXT DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'suspicious', 'malicious', 'reviewed')),
    verified BOOLEAN DEFAULT FALSE,
    downloads INTEGER DEFAULT 0,
    rating NUMERIC(3,2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    
    -- Approval workflow
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'installed', 'uninstalled')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- Access control
    is_enabled BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT TRUE,
    allowed_users TEXT[] DEFAULT '{}',
    allowed_projects UUID[] DEFAULT '{}',
    
    -- Usage tracking
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    installed_at TIMESTAMPTZ,
    
    -- Assessment details (JSONB for flexible storage)
    warnings TEXT[] DEFAULT '{}',
    issues TEXT[] DEFAULT '{}',
    permissions TEXT[] DEFAULT '{}',
    code_analysis JSONB DEFAULT '{}',
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    
    -- Review workflow
    review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'auto_passed', 'auto_failed', 'needs_manual_review', 'manually_approved', 'manually_rejected')),
    auto_review_score INTEGER,
    manual_review_required BOOLEAN DEFAULT FALSE,
    
    -- Content storage
    instructions TEXT,
    manifest JSONB DEFAULT '{}',
    content_hash TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_safety_score ON skills(safety_score DESC);
CREATE INDEX IF NOT EXISTS idx_skills_scan_status ON skills(scan_status);
CREATE INDEX IF NOT EXISTS idx_skills_project_id ON skills(project_id);
CREATE INDEX IF NOT EXISTS idx_skills_tags ON skills USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_skills_rating ON skills(rating DESC);
CREATE INDEX IF NOT EXISTS idx_skills_downloads ON skills(downloads DESC);

-- =============================================
-- SKILL AUDIT LOG (track all changes)
-- =============================================
CREATE TABLE IF NOT EXISTS skill_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    action TEXT NOT NULL CHECK (action IN ('installed', 'uninstalled', 'approved', 'rejected', 'enabled', 'disabled', 'updated', 'reviewed', 'used')),
    performed_by TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    
    details JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_audit_skill_id ON skill_audit_log(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_audit_project_id ON skill_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_skill_audit_action ON skill_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_skill_audit_created ON skill_audit_log(created_at DESC);

-- =============================================
-- SKILL RATING & FEEDBACK
-- =============================================
CREATE TABLE IF NOT EXISTS skill_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    
    use_case TEXT,
    worked_well TEXT,
    could_improve TEXT,
    
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_feedback_skill_id ON skill_feedback(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_feedback_rating ON skill_feedback(rating);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_skills_updated_at ON skills;
CREATE TRIGGER update_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW
    EXECUTE FUNCTION update_skills_updated_at();

-- Log skill changes
CREATE OR REPLACE FUNCTION log_skill_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO skill_audit_log (skill_id, project_id, action, performed_by, new_status, details)
        VALUES (NEW.id, NEW.project_id, 'installed', 'system', NEW.status, jsonb_build_object('version', NEW.version));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO skill_audit_log (skill_id, project_id, action, performed_by, old_status, new_status, details)
            VALUES (
                NEW.id, NEW.project_id,
                CASE 
                    WHEN NEW.status = 'approved' THEN 'approved'
                    WHEN NEW.status = 'rejected' THEN 'rejected'
                    WHEN NEW.status = 'installed' THEN 'installed'
                    WHEN NEW.status = 'uninstalled' THEN 'uninstalled'
                    ELSE 'updated'
                END,
                COALESCE(NEW.approved_by, 'system'),
                OLD.status, NEW.status,
                jsonb_build_object('safety_score', NEW.safety_score, 'scan_status', NEW.scan_status)
            );
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_skill_change ON skills;
CREATE TRIGGER log_skill_change
    AFTER INSERT OR UPDATE OF status ON skills
    FOR EACH ROW
    EXECUTE FUNCTION log_skill_change();

-- =============================================
-- VIEWS FOR EASY QUERIES
-- =============================================

-- Approved skills ready for use
CREATE OR REPLACE VIEW approved_skills AS
SELECT s.*, p.name as project_name
FROM skills s
LEFT JOIN projects p ON s.project_id = p.id
WHERE s.status = 'approved' AND s.is_enabled = TRUE
ORDER BY s.rating DESC, s.safety_score DESC;

-- Skills pending review
CREATE OR REPLACE VIEW pending_skill_reviews AS
SELECT s.*, p.name as project_name
FROM skills s
LEFT JOIN projects p ON s.project_id = p.id
WHERE s.status = 'pending' 
   OR (s.review_status = 'needs_manual_review' AND s.status = 'approved')
ORDER BY s.safety_score ASC, s.created_at DESC;

-- Auto-block malicious skills
CREATE OR REPLACE FUNCTION auto_block_malicious_skills()
RETURNS void AS $$
BEGIN
    UPDATE skills 
    SET status = 'blocked', 
        rejection_reason = 'Auto-blocked: malicious scan status'
    WHERE scan_status = 'malicious' AND status != 'blocked';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

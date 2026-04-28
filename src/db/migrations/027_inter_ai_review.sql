-- Migration: 027_inter_ai_review
-- Description: AI peer review system for inter-agent quality control

CREATE TABLE IF NOT EXISTS inter_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Review metadata
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    commit_hash TEXT,
    branch TEXT,
    
    -- Reviewer info
    reviewer_id TEXT NOT NULL,
    reviewer_type TEXT DEFAULT 'ai' CHECK (reviewer_type IN ('ai', 'human')),
    review_round INTEGER DEFAULT 1,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'superseded')),
    
    -- Review content
    summary TEXT,
    findings JSONB DEFAULT '[]',
    suggestions JSONB DEFAULT '[]',
    issues JSONB DEFAULT '[]',
    praise JSONB DEFAULT '[]',
    
    -- Scores
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    code_quality_score INTEGER CHECK (code_quality_score >= 0 AND code_quality_score <= 100),
    test_coverage_score INTEGER CHECK (test_coverage_score >= 0 AND test_coverage_score <= 100),
    documentation_score INTEGER CHECK (documentation_score >= 0 AND documentation_score <= 100),
    
    -- Response from reviewed party
    response TEXT,
    response_at TIMESTAMPTZ,
    accepted_suggestions JSONB DEFAULT '[]',
    
    -- Timing
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Context (what was reviewed)
    review_context JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_inter_reviews_task_id ON inter_reviews(task_id);
CREATE INDEX IF NOT EXISTS idx_inter_reviews_status ON inter_reviews(status);
CREATE INDEX IF NOT EXISTS idx_inter_reviews_reviewer_id ON inter_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_inter_reviews_commit ON inter_reviews(commit_hash);
CREATE INDEX IF NOT EXISTS idx_inter_reviews_requested ON inter_reviews(requested_at);

-- Function to request a review
CREATE OR REPLACE FUNCTION request_inter_review(
    p_task_id UUID,
    p_commit_hash TEXT,
    p_branch TEXT,
    p_reviewer_id TEXT,
    p_review_context JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_existing_id UUID;
    v_existing_status TEXT;
BEGIN
    -- Check for existing pending/in_progress review for this task
    SELECT id, status INTO v_existing_id, v_existing_status 
    FROM inter_reviews 
    WHERE task_id = p_task_id 
      AND status IN ('pending', 'in_progress')
    ORDER BY requested_at DESC
    LIMIT 1;
    
    -- If there's a pending/in_progress review, reuse it
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;
    
    -- Otherwise create a new review (even if previous one was completed)
    INSERT INTO inter_reviews (
        task_id, commit_hash, branch, reviewer_id, status, review_context, requested_at
    ) VALUES (
        p_task_id, p_commit_hash, p_branch, p_reviewer_id, 'pending', p_review_context, NOW()
    )
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update review status
CREATE OR REPLACE FUNCTION update_inter_review(
    p_id UUID,
    p_status TEXT DEFAULT NULL,
    p_summary TEXT DEFAULT NULL,
    p_findings JSONB DEFAULT NULL,
    p_suggestions JSONB DEFAULT NULL,
    p_issues JSONB DEFAULT NULL,
    p_praise JSONB DEFAULT NULL,
    p_overall_score INTEGER DEFAULT NULL,
    p_code_quality_score INTEGER DEFAULT NULL,
    p_test_coverage_score INTEGER DEFAULT NULL,
    p_documentation_score INTEGER DEFAULT NULL,
    p_raw_response TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE inter_reviews SET
        status = COALESCE(p_status, status),
        summary = COALESCE(p_summary, summary),
        findings = COALESCE(p_findings, findings),
        suggestions = COALESCE(p_suggestions, suggestions),
        issues = COALESCE(p_issues, issues),
        praise = COALESCE(p_praise, praise),
        overall_score = COALESCE(p_overall_score, overall_score),
        code_quality_score = COALESCE(p_code_quality_score, code_quality_score),
        test_coverage_score = COALESCE(p_test_coverage_score, test_coverage_score),
        documentation_score = COALESCE(p_documentation_score, documentation_score),
        raw_response = COALESCE(p_raw_response, raw_response),
        completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE completed_at END
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record review response
CREATE OR REPLACE FUNCTION respond_to_inter_review(
    p_id UUID,
    p_response TEXT,
    p_accepted_suggestions JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID AS $$
BEGIN
    UPDATE inter_reviews SET
        response = p_response,
        response_at = NOW(),
        accepted_suggestions = p_accepted_suggestions
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- View for pending reviews
CREATE OR REPLACE VIEW pending_inter_reviews AS
SELECT 
    ir.id,
    ir.task_id,
    t.title as task_title,
    ir.commit_hash,
    ir.branch,
    ir.reviewer_id,
    ir.requested_at,
    ir.review_round,
    ir.overall_score,
    EXTRACT(EPOCH FROM (NOW() - ir.requested_at)) / 60 as pending_minutes
FROM inter_reviews ir
LEFT JOIN tasks t ON ir.task_id = t.id
WHERE ir.status = 'pending'
ORDER BY ir.requested_at ASC;

-- View for review statistics
CREATE OR REPLACE VIEW inter_review_stats AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    AVG(overall_score) FILTER (WHERE overall_score IS NOT NULL) as avg_score,
    AVG(code_quality_score) FILTER (WHERE code_quality_score IS NOT NULL) as avg_code_quality,
    AVG(test_coverage_score) FILTER (WHERE test_coverage_score IS NOT NULL) as avg_test_coverage,
    AVG(documentation_score) FILTER (WHERE documentation_score IS NOT NULL) as avg_documentation,
    COUNT(DISTINCT reviewer_id) as unique_reviewers
FROM inter_reviews;

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

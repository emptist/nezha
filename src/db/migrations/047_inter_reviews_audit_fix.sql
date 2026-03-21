-- Migration: 047_inter_reviews_audit_fix
-- Description: Fix inter_reviews schema issues found during audit

-- 1. Remove duplicate columns (keep commit_hash/branch, drop git_hash/git_branch)
ALTER TABLE inter_reviews DROP COLUMN IF EXISTS git_hash;
ALTER TABLE inter_reviews DROP COLUMN IF EXISTS git_branch;

-- 2. Add missing response fields
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS response_status TEXT 
    CHECK (response_status IN ('pending', 'accepted', 'rejected', 'partial', 'superseded'));
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS leverage_ratio DECIMAL(5,2) 
    CHECK (leverage_ratio >= 0 AND leverage_ratio <= 100);
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS rework_count INTEGER DEFAULT 0;
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS effort_minutes INTEGER;

-- 3. Add missing indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inter_reviews_status_requested 
    ON inter_reviews(status, requested_at) 
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_inter_reviews_completed 
    ON inter_reviews(completed_at DESC) 
    WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_inter_reviews_reviewer_status 
    ON inter_reviews(reviewer_id, status);

-- 4. Add CASCADE to issues.review_id FK
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_review_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_review_id_fkey 
    FOREIGN KEY (review_id) REFERENCES inter_reviews(id) ON DELETE SET NULL;

-- 5. Update respond_to_inter_review function to support new fields
CREATE OR REPLACE FUNCTION respond_to_inter_review(
    p_id UUID,
    p_response TEXT,
    p_accepted_suggestions JSONB DEFAULT '[]'::jsonb,
    p_reviewed_by TEXT DEFAULT NULL,
    p_response_status TEXT DEFAULT 'accepted',
    p_leverage_ratio DECIMAL DEFAULT NULL,
    p_rework_count INTEGER DEFAULT 0,
    p_effort_minutes INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE inter_reviews SET
        response = p_response,
        response_at = NOW(),
        accepted_suggestions = p_accepted_suggestions,
        reviewed_by = COALESCE(p_reviewed_by, reviewed_by),
        response_status = p_response_status,
        leverage_ratio = p_leverage_ratio,
        rework_count = p_rework_count,
        effort_minutes = p_effort_minutes
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Update inter_review_stats view to include new metrics
CREATE OR REPLACE VIEW inter_review_stats AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    AVG(overall_score) FILTER (WHERE overall_score IS NOT NULL) as avg_score,
    AVG(code_quality_score) FILTER (WHERE code_quality_score IS NOT NULL) as avg_code_quality,
    AVG(test_coverage_score) FILTER (WHERE test_coverage_score IS NOT NULL) as avg_test_coverage,
    AVG(documentation_score) FILTER (WHERE documentation_score IS NOT NULL) as avg_documentation,
    AVG(leverage_ratio) FILTER (WHERE leverage_ratio IS NOT NULL) as avg_leverage_ratio,
    AVG(rework_count) FILTER (WHERE rework_count IS NOT NULL) as avg_rework_count,
    AVG(effort_minutes) FILTER (WHERE effort_minutes IS NOT NULL) as avg_effort_minutes,
    COUNT(DISTINCT reviewer_id) as unique_reviewers,
    COUNT(DISTINCT reviewed_by) FILTER (WHERE reviewed_by IS NOT NULL) as unique_responders
FROM inter_reviews;

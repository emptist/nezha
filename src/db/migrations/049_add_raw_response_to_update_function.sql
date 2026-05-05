-- Migration: 049_add_raw_response_to_update_function
-- Description: Add raw_response parameter to update_inter_review function

-- Drop the old 11-param function to avoid overload ambiguity
DROP FUNCTION IF EXISTS update_inter_review(
    UUID, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, INTEGER, INTEGER, INTEGER, INTEGER
);

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
    p_raw_response TEXT DEFAULT NULL,
    p_reviewed_by TEXT DEFAULT NULL
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
        reviewed_by = COALESCE(p_reviewed_by, reviewed_by),
        completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE completed_at END
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

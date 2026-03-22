-- Migration: 053_fix_respond_to_inter_review
-- Description: Fix respond_to_inter_review to validate reviewId exists

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
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM inter_reviews WHERE id = p_id) INTO v_exists;
    
    IF NOT v_exists THEN
        RAISE EXCEPTION 'Inter-review with id % does not exist', p_id;
    END IF;
    
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

-- Migration: 044_review_issue_dlq_integration
-- Description: Link reviews, issues, and DLQ for better system cohesion

-- Add linking columns
ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES issues(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS review_id UUID REFERENCES inter_reviews(id);
ALTER TABLE dead_letter_queue ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES issues(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS dlq_id UUID REFERENCES dead_letter_queue(id);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_inter_reviews_issue ON inter_reviews(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_review ON issues(review_id) WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_issue ON dead_letter_queue(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_dlq ON issues(dlq_id) WHERE dlq_id IS NOT NULL;

-- Function to auto-broadcast significant review findings
CREATE OR REPLACE FUNCTION broadcast_review_finding()
RETURNS TRIGGER AS $$
BEGIN
    -- Broadcast if severity is critical or high
    IF NEW.overall_score < 50 OR NEW.code_quality_score < 50 THEN
        INSERT INTO broadcasts (message, priority, created_by, metadata)
        VALUES (
            'Review finding: ' || COALESCE(NEW.summary, 'Review completed'),
            CASE WHEN NEW.overall_score < 30 THEN 'critical' ELSE 'high' END,
            'system',
            jsonb_build_object('review_id', NEW.id, 'type', 'review_finding')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-broadcast
DROP TRIGGER IF EXISTS broadcast_review_finding ON inter_reviews;
CREATE TRIGGER broadcast_review_finding
    AFTER INSERT ON inter_reviews
    FOR EACH ROW EXECUTE FUNCTION broadcast_review_finding();

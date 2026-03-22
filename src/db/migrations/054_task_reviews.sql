-- Migration: 054_task_reviews
-- Description: Add task_reviews table for ResultReviewer

CREATE TABLE IF NOT EXISTS task_reviews (
    task_id UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    score INTEGER CHECK (score >= 0 AND score <= 100),
    status TEXT CHECK (status IN ('success', 'partial', 'failure')) DEFAULT 'partial',
    issues JSONB DEFAULT '[]',
    suggestions JSONB DEFAULT '[]',
    reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_reviews_score ON task_reviews(score);
CREATE INDEX IF NOT EXISTS idx_task_reviews_status ON task_reviews(status);
CREATE INDEX IF NOT EXISTS idx_task_reviews_reviewed_at ON task_reviews(reviewed_at);

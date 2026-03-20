-- Migration: Add reviews table for general review tracking with follow-up

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_type TEXT CHECK (review_type IN ('code', 'design', 'qc', 'peer', 'task', 'security', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'follow_up', 'closed')),
  current_state TEXT DEFAULT 'initial',
  target_id TEXT,
  target_type TEXT,
  title TEXT,
  description TEXT,
  reviewer_id TEXT,
  findings JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  follow_up_due TIMESTAMPTZ,
  follow_up_status TEXT DEFAULT 'pending' CHECK (follow_up_status IN ('pending', 'completed', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_follow_up ON reviews(follow_up_status, follow_up_due);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_id, target_type);

COMMENT ON TABLE reviews IS 'General reviews with follow-up tracking for QC, peer review, task review, etc.';

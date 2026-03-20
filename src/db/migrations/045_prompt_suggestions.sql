-- Migration: Add prompt_suggestions table for suggest_prompt_update() function
-- This enables AI agents to suggest improvements to system prompts

CREATE TABLE IF NOT EXISTS prompt_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    current_prompt TEXT NOT NULL,
    suggested_prompt TEXT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')),
    created_by UUID,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    implemented_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_status ON prompt_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_created_at ON prompt_suggestions(created_at DESC);

COMMENT ON TABLE prompt_suggestions IS 'Stores AI-generated prompt improvement suggestions for review and implementation';

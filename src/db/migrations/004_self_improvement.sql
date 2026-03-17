-- Migration: 004_self_improvement
-- Description: Add self-improvement support for AI-driven prompt optimization

-- Create prompt_suggestions table for human-approved prompt changes
CREATE TABLE IF NOT EXISTS prompt_suggestions (
    id UUID PRIMARY KEY,
    current_prompt TEXT NOT NULL,
    suggested_prompt TEXT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_status ON prompt_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_created ON prompt_suggestions(created_at DESC);

-- Add importance column to memory table if not exists (backup check)
ALTER TABLE memory 
ADD COLUMN IF NOT EXISTS importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10);

-- Add source column to memory table if not exists (backup check)
ALTER TABLE memory 
ADD COLUMN IF NOT EXISTS source TEXT;

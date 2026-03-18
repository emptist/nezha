-- Migration: 012_memory_compaction
-- Description: Add archived memory table for memory compaction

-- Create archived memories table
CREATE TABLE IF NOT EXISTS archived_memory (
    id UUID PRIMARY KEY,
    project_id UUID,
    content TEXT NOT NULL,
    metadata JSONB,
    tags TEXT[],
    importance INTEGER DEFAULT 5,
    source VARCHAR(100),
    embedding VECTOR(1536),
    archived_at TIMESTAMPTZ DEFAULT NOW(),
    original_created_at TIMESTAMPTZ,
    original_updated_at TIMESTAMPTZ,
    archive_reason VARCHAR(50) DEFAULT 'compaction'
);

CREATE INDEX idx_archived_memory_project ON archived_memory(project_id);
CREATE INDEX idx_archived_memory_archived_at ON archived_memory(archived_at DESC);

-- Add max_memories config if not exists
ALTER TABLE memory ADD COLUMN IF NOT EXISTS importance INTEGER DEFAULT 5;

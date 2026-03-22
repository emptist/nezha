-- Create reflections table for AI task reflections
CREATE TABLE IF NOT EXISTS reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    
    -- Core reflection content
    summary TEXT NOT NULL,
    learnings JSONB DEFAULT '[]'::jsonb,
    issues JSONB DEFAULT '[]'::jsonb,
    suggestions JSONB DEFAULT '[]'::jsonb,
    praise JSONB DEFAULT '[]'::jsonb,
    
    -- Scores
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    code_quality_score INTEGER CHECK (code_quality_score >= 0 AND code_quality_score <= 100),
    test_coverage_score INTEGER CHECK (test_coverage_score >= 0 AND test_coverage_score <= 100),
    documentation_score INTEGER CHECK (documentation_score >= 0 AND documentation_score <= 100),
    
    -- Metadata
    agent_id TEXT NOT NULL,
    session_id VARCHAR(50),
    task_title TEXT,
    task_result TEXT,
    raw_response TEXT,
    
    -- Classification
    reflection_type VARCHAR(50) DEFAULT 'task_completion',
    sentiment VARCHAR(20),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reflections_task_id ON reflections(task_id);
CREATE INDEX IF NOT EXISTS idx_reflections_agent_id ON reflections(agent_id);
CREATE INDEX IF NOT EXISTS idx_reflections_session_id ON reflections(session_id);
CREATE INDEX IF NOT EXISTS idx_reflections_created_at ON reflections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_type ON reflections(reflection_type);
CREATE INDEX IF NOT EXISTS idx_reflections_score ON reflections(overall_score DESC) WHERE overall_score IS NOT NULL;

-- GIN index for searching learnings
CREATE INDEX IF NOT EXISTS idx_reflections_learnings ON reflections USING gin(learnings);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_reflections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reflections_updated_at
    BEFORE UPDATE ON reflections
    FOR EACH ROW
    EXECUTE FUNCTION update_reflections_updated_at();

-- Comment
COMMENT ON TABLE reflections IS 'Stores AI task reflections with learnings, issues, and scores';
COMMENT ON COLUMN reflections.learnings IS 'JSON array of {topic, reminder} objects';
COMMENT ON COLUMN reflections.issues IS 'JSON array of {severity, location, description} objects';
COMMENT ON COLUMN reflections.reflection_type IS 'Type: task_completion, code_review, learning, etc.';

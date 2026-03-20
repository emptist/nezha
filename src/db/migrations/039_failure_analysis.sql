-- Migration: 039_failure_analysis
-- Description: Add failure analysis tables for tracking patterns, root causes, and retry strategies
-- Date: 2026-03-20

-- Failure patterns table
CREATE TABLE IF NOT EXISTS failure_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type TEXT,
    task_category TEXT,
    error_category TEXT NOT NULL,
    error_pattern TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    success_rate DECIMAL(5,2) DEFAULT 0.0,
    avg_retry_attempts DECIMAL(5,2) DEFAULT 0.0,
    common_fix TEXT,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_type, task_category, error_pattern)
);

CREATE INDEX IF NOT EXISTS idx_failure_patterns_category ON failure_patterns(error_category);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_task_type ON failure_patterns(task_type);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_occurrence ON failure_patterns(occurrence_count DESC);

-- Failure root causes table
CREATE TABLE IF NOT EXISTS failure_root_causes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type TEXT,
    error_category TEXT NOT NULL,
    root_cause TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_root_causes_category ON failure_root_causes(error_category);
CREATE INDEX IF NOT EXISTS idx_root_causes_task_type ON failure_root_causes(task_type);

-- Retry strategies table
CREATE TABLE IF NOT EXISTS retry_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type TEXT NOT NULL,
    task_category TEXT,
    recommended_retries INTEGER DEFAULT 3,
    recommended_backoff DECIMAL(5,2) DEFAULT 2.0,
    recommended_timeout INTEGER DEFAULT 300,
    success_rate DECIMAL(5,2) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_type)
);

CREATE INDEX IF NOT EXISTS idx_retry_strategies_task_type ON retry_strategies(task_type);
CREATE INDEX IF NOT EXISTS idx_retry_strategies_success ON retry_strategies(success_rate DESC);

-- Retry learning table for tracking retry outcomes
CREATE TABLE IF NOT EXISTS retry_learning (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type TEXT,
    task_category TEXT,
    error_category TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retry_learning_task_type ON retry_learning(task_type);
CREATE INDEX IF NOT EXISTS idx_retry_learning_error ON retry_learning(error_category);
CREATE INDEX IF NOT EXISTS idx_retry_learning_success ON retry_learning(success);

COMMENT ON TABLE failure_patterns IS 'Stores known failure patterns with occurrence tracking';
COMMENT ON TABLE failure_root_causes IS 'Common root causes for failures by category';
COMMENT ON TABLE retry_strategies IS 'Learned retry strategies optimized for different task types';
COMMENT ON TABLE retry_learning IS 'Learning data for optimizing retry strategies';

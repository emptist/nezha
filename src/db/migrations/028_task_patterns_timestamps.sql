-- Migration: 028_task_patterns_timestamps
-- Description: Add missing created_at and updated_at columns to task_patterns table

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_patterns' AND column_name = 'created_at') THEN
        ALTER TABLE task_patterns ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to task_patterns';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_patterns' AND column_name = 'updated_at') THEN
        ALTER TABLE task_patterns ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to task_patterns';
    END IF;
END $$;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_task_patterns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_patterns_updated ON task_patterns;
CREATE TRIGGER trigger_task_patterns_updated
    BEFORE UPDATE ON task_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_task_patterns_timestamp();

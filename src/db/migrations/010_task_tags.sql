-- Migration: 010_task_tags
-- Description: Add tags support for tasks

-- Add tags column to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add auto_tag column for keyword-based auto-tagging
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_tagged BOOLEAN DEFAULT false;

-- Create index for tag queries
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING GIN(tags);

-- Create table for auto-tagging rules
CREATE TABLE IF NOT EXISTS auto_tag_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    tag TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_tag_rules_keyword ON auto_tag_rules(keyword);

-- Function to auto-tag a task based on keywords
CREATE OR REPLACE FUNCTION auto_tag_task(p_task_id UUID)
RETURNS VOID AS $$
DECLARE
    v_description TEXT;
    v_tags TEXT[] := '{}';
    v_keyword TEXT;
BEGIN
    -- Get task description
    SELECT description INTO v_description FROM tasks WHERE id = p_task_id;
    
    IF v_description IS NULL THEN
        RETURN;
    END IF;
    
    -- Find matching keywords and collect tags
    FOR v_keyword IN SELECT keyword FROM auto_tag_rules WHERE enabled = true LOOP
        IF v_description ILIKE '%' || v_keyword || '%' THEN
            v_tags := v_tags || (SELECT tag FROM auto_tag_rules WHERE keyword = v_keyword LIMIT 1);
        END IF;
    END LOOP;
    
    -- Update task with tags if any found
    IF array_length(v_tags, 1) > 0 THEN
        UPDATE tasks
        SET tags = v_tags, auto_tagged = true
        WHERE id = p_task_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

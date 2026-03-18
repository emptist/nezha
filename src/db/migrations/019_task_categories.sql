-- Migration: 019_task_categories
-- Description: Add category column for task classification (security, performance, feature, bugfix)

-- Add category column to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('security', 'performance', 'feature', 'bugfix', NULL));

-- Add index for category queries
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);

-- Create table for auto-categorization rules
CREATE TABLE IF NOT EXISTS auto_category_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('security', 'performance', 'feature', 'bugfix')),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_category_rules_keyword ON auto_category_rules(keyword);

-- Pre-populate default categorization rules
INSERT INTO auto_category_rules (keyword, category) VALUES
    ('security', 'security'),
    ('vulnerability', 'security'),
    ('auth', 'security'),
    ('authentication', 'security'),
    ('permission', 'security'),
    ('sql injection', 'security'),
    ('xss', 'security'),
    ('csrf', 'security'),
    ('encrypt', 'security'),
    ('sanitize', 'security'),
    ('performance', 'performance'),
    ('slow', 'performance'),
    ('optimize', 'performance'),
    ('memory', 'performance'),
    ('cpu', 'performance'),
    ('latency', 'performance'),
    ('throughput', 'performance'),
    ('bottleneck', 'performance'),
    ('cache', 'performance'),
    ('benchmark', 'performance'),
    ('feature', 'feature'),
    ('add', 'feature'),
    ('implement', 'feature'),
    ('new', 'feature'),
    ('support', 'feature'),
    ('enhance', 'feature'),
    ('improve', 'feature'),
    ('refactor', 'feature'),
    ('api', 'feature'),
    ('endpoint', 'feature'),
    ('bug', 'bugfix'),
    ('fix', 'bugfix'),
    ('error', 'bugfix'),
    ('crash', 'bugfix'),
    ('fail', 'bugfix'),
    ('bugfix', 'bugfix'),
    ('issue', 'bugfix'),
    ('broken', 'bugfix'),
    ('incorrect', 'bugfix'),
    ('wrong', 'bugfix')
ON CONFLICT DO NOTHING;

-- Function to auto-categorize a task based on keywords
CREATE OR REPLACE FUNCTION auto_categorize_task(p_task_id UUID)
RETURNS VOID AS $$
DECLARE
    v_title TEXT;
    v_description TEXT;
    v_category TEXT;
    v_keyword TEXT;
    v_priority INTEGER;
BEGIN
    -- Get task title and description
    SELECT title, description INTO v_title, v_description FROM tasks WHERE id = p_task_id;
    
    IF v_title IS NULL AND v_description IS NULL THEN
        RETURN;
    END IF;
    
    -- Combine title and description for search
    DECLARE
        v_text TEXT := COALESCE(v_title, '') || ' ' || COALESCE(v_description, '');
    BEGIN
        -- Find highest priority matching rule (security > bugfix > performance > feature)
        SELECT r.category INTO v_category
        FROM auto_category_rules r
        WHERE r.enabled = true
        AND v_text ILIKE '%' || r.keyword || '%'
        ORDER BY 
            CASE r.category
                WHEN 'security' THEN 1
                WHEN 'bugfix' THEN 2
                WHEN 'performance' THEN 3
                WHEN 'feature' THEN 4
            END
        LIMIT 1;
        
        -- Update task with category if found
        IF v_category IS NOT NULL THEN
            UPDATE tasks
            SET category = v_category
            WHERE id = p_task_id;
            
            -- Boost priority based on category
            SELECT priority INTO v_priority FROM tasks WHERE id = p_task_id;
            v_priority := v_priority + 
                CASE v_category
                    WHEN 'security' THEN 5
                    WHEN 'bugfix' THEN 3
                    WHEN 'performance' THEN 2
                    WHEN 'feature' THEN 0
                END;
            
            UPDATE tasks SET priority = v_priority WHERE id = p_task_id;
        END IF;
    END;
END;
$$ LANGUAGE plpgsql;
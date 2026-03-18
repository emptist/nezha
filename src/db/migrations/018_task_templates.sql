-- Migration: 018_task_templates
-- Description: Add task templates table

CREATE TABLE IF NOT EXISTS task_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    priority INTEGER DEFAULT 0,
    task_type TEXT DEFAULT 'implementation',
    timeout_seconds INTEGER DEFAULT 300,
    default_tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_templates_name ON task_templates(name);

-- Pre-populate common templates
INSERT INTO task_templates (name, description, priority, task_type, timeout_seconds) VALUES
    ('code-review', 'Review code for issues, bugs, security concerns, and best practices', 5, 'documentation', 600),
    ('bugfix', 'Fix a specific bug - investigate, reproduce, fix, and test', 10, 'bugfix', 900),
    ('refactor', 'Refactor code for readability, performance, or maintainability', 3, 'implementation', 1200),
    ('testing', 'Write or improve tests for the codebase', 3, 'testing', 900),
    ('docs', 'Create or update documentation', 2, 'documentation', 600),
    ('security-audit', 'Review code for security vulnerabilities', 8, 'analysis', 1800),
    ('performance', 'Analyze and optimize performance bottlenecks', 5, 'analysis', 1200),
    ('research', 'Research a topic or technology', 2, 'research', 1800)
ON CONFLICT (name) DO NOTHING;

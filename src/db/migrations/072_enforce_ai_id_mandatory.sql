-- Migration 072: Enforce AI ID and Project ID as mandatory
-- Description: Make agent_id, created_by, project_id NOT NULL in key tables
-- Principle: Nezha is AI-only system, these fields should always be populated

BEGIN;

-- ============================================
-- STEP 1: Backfill existing data
-- ============================================

-- Memory: Backfill agent_id from metadata->author or source-based inference
UPDATE memory 
SET agent_id = COALESCE(
    (metadata->>'author'),
    CASE 
        WHEN source = 'areflect' THEN 'S-nezha-areflect'
        WHEN source = 'areflect-mcp' THEN 'S-nezha-areflect-mcp'
        WHEN source = 'inter-review' THEN 'S-nezha-inter-review'
        WHEN source LIKE 'reflection%' THEN 'S-nezha-reflection'
        WHEN source = 'learn' THEN 'S-nezha-learn-cli'
        ELSE 'S-nezha-unknown'
    END
)
WHERE agent_id IS NULL;

-- Memory: Backfill project_id to default 'nezha' for system-level memories
UPDATE memory 
SET project_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE project_id IS NULL;

-- Tasks: Backfill created_by from task patterns or default
UPDATE tasks 
SET created_by = COALESCE(
    created_by,
    CASE 
        WHEN created_by IS NULL AND source = 'cli' THEN 'human'
        WHEN created_by IS NULL THEN 'S-nezha-system'
        ELSE created_by
    END
)
WHERE created_by IS NULL;

-- Tasks: Backfill project_id
UPDATE tasks 
SET project_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE project_id IS NULL;

-- Issues: Backfill created_by
UPDATE issues 
SET created_by = COALESCE(
    created_by,
    discovered_by,
    'S-nezha-system'
)
WHERE created_by IS NULL;

-- Project communications: Backfill project_id
UPDATE project_communications 
SET project_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE project_id IS NULL;

-- Skills: Backfill project_id
UPDATE skills 
SET project_id = 'nezha'
WHERE project_id IS NULL;

-- Skills: Backfill created_by
UPDATE skills 
SET created_by = COALESCE(created_by, 'S-nezha-system')
WHERE created_by IS NULL;

-- Table documentation: Backfill created_by
UPDATE table_documentation 
SET created_by = COALESCE(created_by, 'S-nezha-system')
WHERE created_by IS NULL;

-- ============================================
-- STEP 2: Add NOT NULL constraints
-- ============================================

-- Memory: Make agent_id NOT NULL (with default)
ALTER TABLE memory 
ALTER COLUMN agent_id SET DEFAULT 'S-nezha-unknown',
ALTER COLUMN agent_id SET NOT NULL;

-- Memory: Make project_id NOT NULL
ALTER TABLE memory 
ALTER COLUMN project_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
ALTER COLUMN project_id SET NOT NULL;

-- Tasks: Make created_by NOT NULL
ALTER TABLE tasks 
ALTER COLUMN created_by SET DEFAULT 'human',
ALTER COLUMN created_by SET NOT NULL;

-- Tasks: Make project_id NOT NULL
ALTER TABLE tasks 
ALTER COLUMN project_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
ALTER COLUMN project_id SET NOT NULL;

-- Issues: Make created_by NOT NULL
ALTER TABLE issues 
ALTER COLUMN created_by SET DEFAULT 'S-nezha-system',
ALTER COLUMN created_by SET NOT NULL;

-- Project communications: Make project_id NOT NULL
ALTER TABLE project_communications 
ALTER COLUMN project_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
ALTER COLUMN project_id SET NOT NULL;

-- Skills: Make project_id NOT NULL
ALTER TABLE skills 
ALTER COLUMN project_id SET DEFAULT 'nezha',
ALTER COLUMN project_id SET NOT NULL;

-- Skills: Make created_by NOT NULL
ALTER TABLE skills 
ALTER COLUMN created_by SET DEFAULT 'S-nezha-system',
ALTER COLUMN created_by SET NOT NULL;

-- Table documentation: Make created_by NOT NULL
ALTER TABLE table_documentation 
ALTER COLUMN created_by SET DEFAULT 'S-nezha-system',
ALTER COLUMN created_by SET NOT NULL;

-- ============================================
-- STEP 3: Update table_documentation
-- ============================================

-- Update memory documentation
UPDATE table_documentation 
SET 
    key_columns = '{"id": "UUID primary key", "content": "Learning content", "tags": "Array of tags", "agent_id": "AI agent ID (NOT NULL)", "project_id": "Project ID (NOT NULL)", "source": "Origin source"}'::jsonb,
    related_tables = ARRAY['tasks', 'issues', 'knowledge_links', 'skill_feedback'],
    updated_at = NOW()
WHERE table_name = 'memory';

-- Update tasks documentation
UPDATE table_documentation 
SET 
    key_columns = '{"id": "UUID primary key", "title": "Task title", "status": "PENDING|RUNNING|COMPLETED|FAILED", "priority": "1-100", "created_by": "Creator ID (NOT NULL)", "project_id": "Project ID (NOT NULL)", "agent_id": "Assigned agent ID"}'::jsonb,
    related_tables = ARRAY['task_audit_log', 'task_comments', 'dead_letter_queue', 'memory'],
    updated_at = NOW()
WHERE table_name = 'tasks';

-- Update issues documentation
UPDATE table_documentation 
SET 
    key_columns = '{"id": "UUID primary key", "title": "Issue title", "severity": "low|medium|high|critical", "status": "open|in_progress|resolved", "created_by": "Creator ID (NOT NULL)"}'::jsonb,
    related_tables = ARRAY['issue_comments', 'issue_events', 'issue_labels'],
    updated_at = NOW()
WHERE table_name = 'issues';

-- Update project_communications documentation
UPDATE table_documentation 
SET 
    key_columns = '{"id": "UUID primary key", "from_ai": "Sender AI ID", "to_ai": "Receiver AI ID", "message_type": "broadcast|notification|task|review", "project_id": "Project ID (NOT NULL)"}'::jsonb,
    related_tables = ARRAY['agent_identities', 'activity_log'],
    updated_at = NOW()
WHERE table_name = 'project_communications';

-- Update skills documentation
UPDATE table_documentation 
SET 
    key_columns = '{"id": "UUID primary key", "name": "Skill name", "project_id": "Project ID (NOT NULL)", "created_by": "Creator ID (NOT NULL)", "trigger_phrases": "Activation keywords"}'::jsonb,
    related_tables = ARRAY['skill_versions', 'skill_feedback', 'project_skills'],
    updated_at = NOW()
WHERE table_name = 'skills';

-- Add entries for newly documented tables (partial - high priority ones)
INSERT INTO table_documentation (table_name, purpose, usage_context, key_columns, related_tables, ai_can_modify, created_by, notes, tags)
VALUES 
    ('activity_log', 'Track AI agent activities and actions', 'Monitoring and auditing AI work', 
     '{"id": "UUID", "agent_id": "AI ID (NOT NULL)", "activity": "Activity type", "context": "JSON context"}'::jsonb, 
     ARRAY['agent_identities', 'project_communications'], true, 'S-nezha-migration-072',
     'Tracks what each AI agent does for accountability', ARRAY['audit', 'monitoring']),

    ('dead_letter_queue', 'Store failed tasks for retry', 'Task failure handling',
     '{"id": "UUID", "task_id": "Original task UUID", "error": "Failure reason", "retries": "Retry count"}'::jsonb,
     ARRAY['tasks'], true, 'S-nezha-migration-072',
     'Failed tasks land here for investigation and retry', ARRAY['failure', 'retry']),

    ('scheduled_tasks', 'Cron-based scheduled task execution', 'Recurring work automation',
     '{"id": "UUID", "name": "Task name", "cron_expression": "Cron schedule", "enabled": "Boolean", "created_by": "Creator ID"}'::jsonb,
     ARRAY['tasks'], true, 'S-nezha-migration-072',
     'Uses croner library for cron parsing', ARRAY['scheduler', 'automation']),

    ('inter_reviews', 'AI-to-AI code review system', 'Quality assurance',
     '{"id": "UUID", "reviewer_id": "Reviewer AI ID", "status": "pending|completed", "findings": "JSON findings array"}'::jsonb,
     ARRAY['tasks', 'reviews'], true, 'S-nezha-migration-072',
     'Enables AI agents to review each other work', ARRAY['review', 'quality']),

    ('reflections', 'AI self-reflection and learning', 'AI self-improvement',
     '{"id": "UUID", "agent_id": "AI ID (NOT NULL)", "reflection_type": "Type of reflection", "content": "Reflection text"}'::jsonb,
     ARRAY['memory', 'agent_identities'], true, 'S-nezha-migration-072',
     'Captures AI thinking and learning', ARRAY['learning', 'reflection'])

ON CONFLICT (table_name) DO NOTHING;

COMMIT;

-- Verify counts after migration
SELECT 
    'memory.agent_id' as col, COUNT(*) as null_count FROM memory WHERE agent_id IS NULL
UNION ALL SELECT 'memory.project_id', COUNT(*) FROM memory WHERE project_id IS NULL
UNION ALL SELECT 'tasks.created_by', COUNT(*) FROM tasks WHERE created_by IS NULL
UNION ALL SELECT 'tasks.project_id', COUNT(*) FROM tasks WHERE project_id IS NULL
UNION ALL SELECT 'issues.created_by', COUNT(*) FROM issues WHERE created_by IS NULL
UNION ALL SELECT 'project_communications.project_id', COUNT(*) FROM project_communications WHERE project_id IS NULL
UNION ALL SELECT 'skills.project_id', COUNT(*) FROM skills WHERE project_id IS NULL
UNION ALL SELECT 'skills.created_by', COUNT(*) FROM skills WHERE created_by IS NULL;
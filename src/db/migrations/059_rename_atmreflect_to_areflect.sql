-- Migration 059: Rename atmReflect to areflect
-- Issue: atmReflect naming is confusing for AIs, changed to areflect (autonomous reflect)
-- Class name: AtmReflect → AutonomousReflect
-- CLI command: atmReflect → areflect

-- ============================================================================
-- 1. Exact match columns (source, created_by, discovered_by, from_ai, to_ai)
-- ============================================================================

-- Update memory source
UPDATE memory SET source = 'areflect' WHERE source = 'atmReflect';

-- Update memory metadata (author and source fields)
UPDATE memory 
SET metadata = jsonb_set(
  jsonb_set(metadata, '{source}', '"areflect"'),
  '{author}', '"areflect"'
)
WHERE metadata->>'source' = 'atmReflect' 
   OR metadata->>'author' = 'atmReflect';

-- Update memory metadata context field (text replacement)
UPDATE memory 
SET metadata = jsonb_set(metadata, '{context}', to_jsonb(REPLACE(metadata->>'context', 'atmReflect', 'areflect')))
WHERE metadata::text ILIKE '%atmReflect%';

-- Update tasks created_by
UPDATE tasks SET created_by = 'areflect' WHERE created_by = 'atmReflect';

-- Update issues discovered_by
UPDATE issues SET discovered_by = 'areflect' WHERE discovered_by = 'atmReflect';

-- Update project_communications from_ai (exact match)
UPDATE project_communications SET from_ai = 'areflect' WHERE from_ai = 'atmReflect';

-- Update project_communications from_ai (text replacement for variants like atmReflect-cli)
UPDATE project_communications SET from_ai = REPLACE(from_ai, 'atmReflect', 'areflect') WHERE from_ai ILIKE '%atmReflect%';

-- Update project_communications to_ai
UPDATE project_communications SET to_ai = 'areflect' WHERE to_ai = 'atmReflect';

-- ============================================================================
-- 2. Text columns with CLI command references (atmReflect → areflect)
-- ============================================================================

-- Update insert_reminders
UPDATE insert_reminders SET instruction = REPLACE(instruction, 'atmReflect', 'areflect') WHERE instruction ILIKE '%atmReflect%';

-- Update issues title and resolution
UPDATE issues SET title = REPLACE(title, 'atmReflect', 'areflect') WHERE title ILIKE '%atmReflect%';
UPDATE issues SET resolution = REPLACE(resolution, 'atmReflect', 'areflect') WHERE resolution ILIKE '%atmReflect%';

-- Update dead_letter_queue
UPDATE dead_letter_queue SET description = REPLACE(description, 'atmReflect', 'areflect') WHERE description ILIKE '%atmReflect%';

-- Update direct_insert_audit
UPDATE direct_insert_audit SET author = REPLACE(author, 'atmReflect', 'areflect') WHERE author ILIKE '%atmReflect%';

-- Update failure_alerts
UPDATE failure_alerts SET title = REPLACE(title, 'atmReflect', 'areflect') WHERE title ILIKE '%atmReflect%';

-- Update issue_events
UPDATE issue_events SET actor = REPLACE(actor, 'atmReflect', 'areflect') WHERE actor ILIKE '%atmReflect%';

-- Update scheduled_tasks
UPDATE scheduled_tasks SET name = REPLACE(name, 'atmReflect', 'areflect') WHERE name ILIKE '%atmReflect%';

-- Update task_audit_log
UPDATE task_audit_log SET task_title = REPLACE(task_title, 'atmReflect', 'areflect') WHERE task_title ILIKE '%atmReflect%';

-- Update task_outcomes
UPDATE task_outcomes SET task_description = REPLACE(task_description, 'atmReflect', 'areflect') WHERE task_description ILIKE '%atmReflect%';

-- Update tasks title
UPDATE tasks SET title = REPLACE(title, 'atmReflect', 'areflect') WHERE title ILIKE '%atmReflect%';

-- Update project_communications content
UPDATE project_communications SET content = REPLACE(content, 'atmReflect', 'areflect') WHERE content ILIKE '%atmReflect%';

-- Update inter_reviews (case-insensitive replacement for all variants)
UPDATE inter_reviews SET raw_response = regexp_replace(raw_response, 'atmreflect', 'areflect', 'gi') WHERE raw_response ~* 'atmreflect';

-- ============================================================================
-- 3. Class name references (AtmReflect → AutonomousReflect)
-- ============================================================================

-- Update failure_alerts title
UPDATE failure_alerts SET title = REPLACE(title, 'AtmReflect', 'AutonomousReflect') WHERE title ILIKE '%AtmReflect%';

-- Update task_audit_log
UPDATE task_audit_log SET task_title = REPLACE(task_title, 'AtmReflect', 'AutonomousReflect') WHERE task_title ILIKE '%AtmReflect%';

-- Update task_outcomes
UPDATE task_outcomes SET task_description = REPLACE(task_description, 'AtmReflect', 'AutonomousReflect') WHERE task_description ILIKE '%AtmReflect%';

-- Update tasks title
UPDATE tasks SET title = REPLACE(title, 'AtmReflect', 'AutonomousReflect') WHERE title ILIKE '%AtmReflect%';

-- Update inter_reviews (class name replacement)
UPDATE inter_reviews SET raw_response = REPLACE(raw_response, 'AtmReflect', 'AutonomousReflect') WHERE raw_response ILIKE '%AtmReflect%';

-- Vibe-Author: areflect

-- Migration: 041_task_type_discussion
-- Description: Add 'discussion' and 'announcement' to valid task types
-- Date: 2026-03-20
-- Issue: MeetingCommands uses 'discussion' type which was not in constraint

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check 
CHECK (type = ANY (ARRAY[
    'analysis'::text,
    'implementation'::text,
    'documentation'::text,
    'bugfix'::text,
    'research'::text,
    'testing'::text,
    'deployment'::text,
    'maintenance'::text,
    'discussion'::text,
    'announcement'::text
]));

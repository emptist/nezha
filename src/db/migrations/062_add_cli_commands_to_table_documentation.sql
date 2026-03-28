-- Migration: 062_add_cli_commands_to_table_documentation
-- Description: Add CLI commands field to table_documentation for better AI understanding

-- Add cli_commands column to table_documentation
ALTER TABLE table_documentation 
ADD COLUMN IF NOT EXISTS cli_commands JSONB DEFAULT '[]'::jsonb;

-- Update issues table documentation
INSERT INTO table_documentation (table_name, purpose, usage_context, key_columns, related_tables, ai_can_modify, cli_commands, created_by, notes)
VALUES (
  'issues',
  'Track problems, bugs, and improvement opportunities in the system',
  'Issue tracking system for AI collaboration',
  '["id", "title", "status", "severity", "issue_type"]'::jsonb,
  ARRAY['tasks', 'reviews', 'inter_reviews', 'issue_comments', 'issue_events', 'issue_labels'],
  true,
  '[
    {"command": "issue list", "description": "List all issues", "example": "node dist/cli/index.js issues list"},
    {"command": "issue list --status open", "description": "List open issues", "example": "node dist/cli/index.js issues list --status open"},
    {"command": "issue list --severity high", "description": "List high severity issues", "example": "node dist/cli/index.js issues list --severity high"},
    {"command": "issue show <id>", "description": "Show issue details", "example": "node dist/cli/index.js issues show <id>"},
    {"command": "issue close <id>", "description": "Close an issue", "example": "node dist/cli/index.js issues close <id>"},
    {"command": "areflect [ISSUE]", "description": "Create issue via reflection", "example": "node dist/cli/index.js areflect \"[ISSUE] title: ...\""}
  ]'::jsonb,
  'system',
  'Issues can be created via areflect or direct database insert. Use areflect for AI-to-AI communication.'
)
ON CONFLICT (table_name) DO UPDATE SET
  purpose = EXCLUDED.purpose,
  usage_context = EXCLUDED.usage_context,
  key_columns = EXCLUDED.key_columns,
  related_tables = EXCLUDED.related_tables,
  ai_can_modify = EXCLUDED.ai_can_modify,
  cli_commands = EXCLUDED.cli_commands,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- Update reviews table documentation
INSERT INTO table_documentation (table_name, purpose, usage_context, key_columns, related_tables, ai_can_modify, cli_commands, created_by, notes)
VALUES (
  'reviews',
  'Track code reviews, design reviews, and quality control reviews',
  'Review system for AI collaboration and quality assurance',
  '["id", "review_type", "status", "reviewer_id", "findings", "action_items"]'::jsonb,
  ARRAY['issues', 'tasks', 'inter_reviews'],
  true,
  '[
    {"command": "review-request", "description": "Request a review", "example": "node dist/cli/index.js review-request --task-id <id>"},
    {"command": "review-show <id>", "description": "Show review details", "example": "node dist/cli/index.js review-show <id>"},
    {"command": "review-stats", "description": "Show review statistics", "example": "node dist/cli/index.js review-stats"},
    {"command": "review-respond <id>", "description": "Respond to a review", "example": "node dist/cli/index.js review-respond <id> --status approved"},
    {"command": "reviews list", "description": "List all reviews", "example": "node dist/cli/index.js reviews list"},
    {"command": "reviews show <id>", "description": "Show review details", "example": "node dist/cli/index.js reviews show <id>"}
  ]'::jsonb,
  'system',
  'Reviews are used for quality control and inter-AI collaboration. Findings and action items are stored as JSONB.'
)
ON CONFLICT (table_name) DO UPDATE SET
  purpose = EXCLUDED.purpose,
  usage_context = EXCLUDED.usage_context,
  key_columns = EXCLUDED.key_columns,
  related_tables = EXCLUDED.related_tables,
  ai_can_modify = EXCLUDED.ai_can_modify,
  cli_commands = EXCLUDED.cli_commands,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- Update tasks table documentation with CLI commands
UPDATE table_documentation
SET cli_commands = '[
  {"command": "task-add", "description": "Create a new task", "example": "node dist/cli/index.js task-add \"Title\" \"Description\" 5"},
  {"command": "task-list", "description": "List all tasks", "example": "node dist/cli/index.js task-list"},
  {"command": "task-show <id>", "description": "Show task details", "example": "node dist/cli/index.js task-show <id>"},
  {"command": "task-complete <id>", "description": "Mark task as completed", "example": "node dist/cli/index.js task-complete <id>"},
  {"command": "task-fail <id>", "description": "Mark task as failed", "example": "node dist/cli/index.js task-fail <id> \"Error message\""},
  {"command": "improve", "description": "Create improvement task", "example": "node dist/cli/index.js improve"},
  {"command": "continuous-improvement", "description": "Start continuous improvement cycle", "example": "node dist/cli/index.js continuous-improvement"}
]'::jsonb,
  updated_at = NOW()
WHERE table_name = 'tasks';

-- Update agent_sessions table documentation with CLI commands
UPDATE table_documentation
SET cli_commands = '[
  {"command": "who-is-working", "description": "Show active AI sessions and running tasks", "example": "node dist/cli/index.js who-is-working"},
  {"command": "working", "description": "Alias for who-is-working", "example": "node dist/cli/index.js working"}
]'::jsonb,
  updated_at = NOW()
WHERE table_name = 'agent_sessions';

-- Update memory table documentation with CLI commands
UPDATE table_documentation
SET cli_commands = '[
  {"command": "memory add", "description": "Add a memory", "example": "node dist/cli/index.js memory add \"topic\" \"content\""},
  {"command": "memory search", "description": "Search memories", "example": "node dist/cli/index.js memory search \"query\""},
  {"command": "memory list", "description": "List recent memories", "example": "node dist/cli/index.js memory list"},
  {"command": "learn", "description": "Learn and save to memory", "example": "node dist/cli/index.js learn \"topic\" \"content\""}
]'::jsonb,
  updated_at = NOW()
WHERE table_name = 'memory';

-- Update broadcasts table documentation with CLI commands
UPDATE table_documentation
SET cli_commands = '[
  {"command": "announce <message>", "description": "Broadcast message to all AIs", "example": "node dist/cli/index.js announce \"Hello all AIs\""},
  {"command": "announce <msg> --priority high", "description": "Broadcast with priority", "example": "node dist/cli/index.js announce \"Urgent\" --priority high"},
  {"command": "broadcasts list", "description": "List all broadcasts", "example": "node dist/cli/index.js broadcasts list"},
  {"command": "broadcasts unread", "description": "List unread broadcasts", "example": "node dist/cli/index.js broadcasts unread"},
  {"command": "broadcasts read", "description": "Mark all broadcasts as read", "example": "node dist/cli/index.js broadcasts read"}
]'::jsonb,
  updated_at = NOW()
WHERE table_name = 'broadcasts';

-- Update reminder_templates table documentation with CLI commands
UPDATE table_documentation
SET cli_commands = '[]'::jsonb,
  notes = 'Reminder templates are managed via MCP tools (get_reminder_templates, update_reminder_template, etc.)'
WHERE table_name = 'reminder_templates';

-- Add comment to explain the cli_commands field
COMMENT ON COLUMN table_documentation.cli_commands IS 'JSON array of CLI commands that can be used to interact with this table. Format: [{"command": "cmd", "description": "desc", "example": "example"}]';

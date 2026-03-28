-- Migration: Table Documentation System
-- Purpose: Create a self-documenting database schema for AI autonomy
-- Allows AI to understand existing tables before creating new ones

CREATE TABLE IF NOT EXISTS table_documentation (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  usage_context TEXT,
  key_columns JSONB DEFAULT '{}',
  related_tables TEXT[] DEFAULT '{}',
  ai_can_modify BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_table_documentation_name ON table_documentation(table_name);
CREATE INDEX IF NOT EXISTS idx_table_documentation_ai_can_modify ON table_documentation(ai_can_modify) WHERE ai_can_modify = true;

-- Insert documentation for existing tables
INSERT INTO table_documentation (table_name, purpose, usage_context, key_columns, related_tables, notes) VALUES
-- Core Tables
('tasks', 'Store tasks for AI to execute', 'Task scheduling and execution system', '{"id": "UUID primary key", "title": "Task title", "status": "pending/running/completed/failed", "priority": "1-10", "created_by": "AI or human identifier"}', '{"issues", "memory", "agent_sessions"}', 'Main task queue for AI work'),
('issues', 'Track problems and improvement opportunities', 'Issue tracking system', '{"id": "UUID primary key", "title": "Issue title", "status": "open/in_progress/resolved/closed", "severity": "critical/high/medium/low"}', '{"tasks", "issue_comments", "issue_labels"}', 'Problems found during code review or operation'),
('memory', 'Store AI learnings and knowledge', 'Knowledge management system', '{"id": "UUID primary key", "content": "Learning content", "tags": "Array of tags", "importance": "1-10"}', '{"tasks", "issues", "knowledge_links"}', 'Persistent memory for AI learning'),

-- Template Tables
('task_templates', 'Templates for creating tasks', 'Task creation shortcuts', '{"name": "Template name (unique)", "task_type": "implementation/bugfix/testing/etc", "timeout_seconds": "Default timeout"}', '{"tasks"}', 'Pre-defined task templates like code-review, bugfix'),
('reminder_templates', 'Templates for reminder messages', 'Secretary mode reminder system', '{"name": "Template name", "template": "Handlebars template", "variables": "Available variables", "priority": "Template priority"}', '{}', 'Dynamic reminder message templates for AI secretary'),

-- Reminder and Audit Tables
('insert_reminders', 'Audit reminders for direct database inserts', 'Database audit system', '{"table_name": "Target table", "instruction": "What to use instead of direct insert"}', '{}', 'Reminds AI to use proper channels instead of direct INSERT'),

-- Agent and Session Tables
('agent_sessions', 'Track AI agent sessions', 'Session management', '{"id": "UUID primary key", "agent_id": "Agent identifier", "status": "active/idle/terminated"}', '{"tasks", "memory"}', 'Track AI agent work sessions'),
('agent_identities', 'Manage AI agent identities', 'Identity management', '{"id": "UUID primary key", "name": "Agent name", "type": "Agent type"}', '{"agent_sessions"}', 'AI agent identity registry'),

-- Communication Tables
('project_communications', 'Project-wide communications', 'Broadcast messaging', '{"id": "UUID primary key", "message": "Communication content", "from_ai": "Sender identifier"}', '{}', 'Project-wide announcements and messages'),
('meeting_opinions', 'Store meeting opinions and decisions', 'Meeting management', '{"id": "UUID primary key", "meeting_id": "Meeting reference", "author": "Opinion author"}', '{"meetings"}', 'Opinions expressed in meetings'),

-- Learning and Knowledge Tables
('learning_insights', 'Store learning insights', 'Learning system', '{"id": "UUID primary key", "insight": "Insight content", "category": "Insight category"}', '{"memory"}', 'Insights extracted from learning'),
('knowledge_links', 'Link related knowledge items', 'Knowledge graph', '{"from_id": "Source memory", "to_id": "Target memory", "relationship": "Relationship type"}', '{"memory"}', 'Connect related learnings'),

-- MCP and Configuration Tables
('mcp_configs', 'MCP server configurations', 'MCP management', '{"id": "UUID primary key", "name": "Server name", "config": "Server configuration JSON"}', '{}', 'MCP server settings'),
('mcp_tools', 'Available MCP tools', 'Tool registry', '{"id": "UUID primary key", "name": "Tool name", "description": "Tool description"}', '{"mcp_configs"}', 'Registry of available MCP tools'),

-- Failure and Monitoring Tables
('failure_patterns', 'Track failure patterns', 'Failure analysis', '{"id": "UUID primary key", "pattern": "Failure pattern description"}', '{"failure_root_causes"}', 'Common failure patterns'),
('failure_alerts', 'Failure alerts and notifications', 'Alert system', '{"id": "UUID primary key", "severity": "Alert severity", "message": "Alert message"}', '{}', 'Failure alerts'),

-- Statistics and Analytics Tables
('inter_reviews', 'Inter-review analysis results', 'Review system', '{"id": "UUID primary key", "review_type": "Type of review"}', '{"issues", "tasks"}', 'Inter-review analysis data'),
('issue_stats', 'Issue statistics', 'Analytics', '{"issue_id": "Issue reference", "stat_type": "Statistic type"}', '{"issues"}', 'Issue-related statistics'),

-- Heartbeat and Health Tables
('heartbeat_configs', 'Heartbeat service configurations', 'Health monitoring', '{"id": "UUID primary key", "service_name": "Service name", "interval_ms": "Heartbeat interval"}', '{}', 'Service health configurations'),

-- Archive and Cleanup Tables
('archived_memory', 'Archived old memories', 'Memory management', '{"id": "UUID primary key", "original_id": "Original memory ID", "archived_at": "Archive timestamp"}', '{"memory"}', 'Old memories moved to archive')
ON CONFLICT (table_name) DO UPDATE SET
  purpose = EXCLUDED.purpose,
  usage_context = EXCLUDED.usage_context,
  key_columns = EXCLUDED.key_columns,
  related_tables = EXCLUDED.related_tables,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- Trigger for auto-update
CREATE OR REPLACE FUNCTION update_table_documentation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_table_documentation_timestamp ON table_documentation;
CREATE TRIGGER trigger_update_table_documentation_timestamp
  BEFORE UPDATE ON table_documentation
  FOR EACH ROW
  EXECUTE FUNCTION update_table_documentation_timestamp();

-- Comments
COMMENT ON TABLE table_documentation IS 'Self-documenting database schema for AI autonomy';
COMMENT ON COLUMN table_documentation.purpose IS 'What this table is used for';
COMMENT ON COLUMN table_documentation.usage_context IS 'Context where this table is used';
COMMENT ON COLUMN table_documentation.key_columns IS 'JSON describing important columns';
COMMENT ON COLUMN table_documentation.related_tables IS 'Array of related table names';
COMMENT ON COLUMN table_documentation.ai_can_modify IS 'Whether AI can modify this table structure';
COMMENT ON COLUMN table_documentation.notes IS 'Additional notes for AI reference';

-- Create a view for easy AI access
CREATE OR REPLACE VIEW v_table_documentation AS
SELECT 
  table_name,
  purpose,
  usage_context,
  key_columns,
  related_tables,
  ai_can_modify,
  notes,
  created_at,
  updated_at
FROM table_documentation
ORDER BY table_name;

COMMENT ON VIEW v_table_documentation IS 'Easy-access view for AI to understand database schema';

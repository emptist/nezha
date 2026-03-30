-- Update table_documentation with CLI commands and MCP tools

-- tasks table
UPDATE table_documentation SET
cli_commands = '[{"cmd": "psql -U postgres -d nezha -c \"SELECT id, title, status, priority FROM tasks WHERE status = '\''PENDING'\'' ORDER BY priority DESC LIMIT 10;\"", "desc": "查看待办任务"}, {"cmd": "psql -U postgres -d nezha -c \"INSERT INTO tasks (title, description, priority, created_by) VALUES ('\''任务标题'\'', '\''描述'\'', 50, '\''ai'\'');\"", "desc": "创建新任务"}, {"cmd": "psql -U postgres -d nezha -c \"UPDATE tasks SET status = '\''COMPLETED'\'', completed_at = NOW() WHERE id = '\''uuid'\'';\"", "desc": "完成任务"}]',
mcp_tools = ARRAY['get_tasks', 'create_task']
WHERE table_name = 'tasks';

-- memory table
UPDATE table_documentation SET
cli_commands = '[{"cmd": "psql -U postgres -d nezha -c \"SELECT content, created_at FROM memory ORDER BY created_at DESC LIMIT 10;\"", "desc": "查看最近记忆"}, {"cmd": "nezha share \"学习内容\"", "desc": "保存学习到记忆"}]',
mcp_tools = ARRAY['learn', 'memory_search']
WHERE table_name = 'memory';

-- issues table
UPDATE table_documentation SET
cli_commands = '[{"cmd": "psql -U postgres -d nezha -c \"SELECT id, title, status, severity FROM issues WHERE status != '\''resolved'\'' ORDER BY severity DESC;\"", "desc": "查看开放问题"}, {"cmd": "psql -U postgres -d nezha -c \"INSERT INTO issues (title, description, issue_type, severity) VALUES ('\''问题标题'\'', '\''描述'\'', '\''bug'\'', '\''high'\'');\"", "desc": "创建新问题"}]',
mcp_tools = ARRAY['create_issue', 'update_issue'],
tags = ARRAY['issue-tracking', 'bugs', 'improvements']
WHERE table_name = 'issues';

-- reviews table
UPDATE table_documentation SET
cli_commands = '[{"cmd": "psql -U postgres -d nezha -c \"SELECT id, review_type, status, findings FROM reviews ORDER BY created_at DESC LIMIT 5;\"", "desc": "查看评审记录"}]',
mcp_tools = ARRAY['create_review', 'get_reviews']
WHERE table_name = 'reviews';

-- inter_reviews table
UPDATE table_documentation SET
cli_commands = '[{"cmd": "psql -U postgres -d nezha -c \"SELECT id, review_type, status, scores FROM inter_reviews ORDER BY created_at DESC LIMIT 5;\"", "desc": "查看AI互评记录"}]',
mcp_tools = ARRAY['get_inter_review_stats']
WHERE table_name = 'inter_reviews';

-- task_outcomes table
UPDATE table_documentation SET
notes = 'AI应在此表记录任务执行结果，用于检测假完成和学习。只有此表可以被AI直接INSERT。'
WHERE table_name = 'task_outcomes';

-- table_documentation itself
UPDATE table_documentation SET
cli_commands = '[{"cmd": "psql -U postgres -d nezha -c \"SELECT table_name, purpose FROM table_documentation ORDER BY table_name;\"", "desc": "查看所有表文档"}, {"cmd": "psql -U postgres -d nezha -c \"SELECT table_name, cli_commands FROM table_documentation WHERE table_name = '\''tasks'\'';\"", "desc": "查看特定表的命令"}]',
notes = '这是AI工具索引表。AI应首先查询此表了解数据库结构和可用命令。AI有责任维护此表。'
WHERE table_name = 'table_documentation';

-- Enhance table_documentation with new fields for AI tool discovery
-- Added: example_queries, mcp_tools, tags

ALTER TABLE table_documentation 
ADD COLUMN IF NOT EXISTS example_queries jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS mcp_tools text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add self-referential entry for table_documentation itself
INSERT INTO table_documentation (table_name, purpose, usage_context, key_columns, related_tables, ai_can_modify, notes, tags)
VALUES (
  'table_documentation',
  'AI工具索引 - 查找CLI命令的表',
  'AI启动时先查询此表找需要用的CLI命令',
  '{"table_name": "表名", "purpose": "用途", "cli_commands": "相关命令", "tags": "搜索标签"}',
  '{}',
  true,
  'AI查此表找到需要用的CLI命令，相当于man pages',
  ARRAY['tool', 'index', 'reference', 'cli', 'command']
)
ON CONFLICT (table_name) DO NOTHING;

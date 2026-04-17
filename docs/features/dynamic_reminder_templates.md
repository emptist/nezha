# Dynamic Reminder Template System

> ⚠️ **Note**: MCP removed - use CLI commands instead.

## Current Status: Skill System Working

- 614 skills in PostgreSQL
- CLI: `nezha skill list/search/show/build/suggest`
- `nezha learn` and `nezha areflect` working

## Overview

Implemented a fully autonomous reminder template system that allows AI to customize reminder messages without human intervention.

## Components

### 1. Database Tables

#### `reminder_templates`

Stores customizable reminder message templates.

```sql
CREATE TABLE reminder_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 5,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Default Templates:**

- `default_reminder` - General system status reminder (priority: 5)
- `urgent_reminder` - Critical issues reminder (priority: 10)
- `learning_reminder` - Learning-focused reminder (priority: 3)

#### `table_documentation`

Self-documenting database schema for AI autonomy.

```sql
CREATE TABLE table_documentation (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  usage_context TEXT,
  key_columns JSONB DEFAULT '{}',
  related_tables TEXT[] DEFAULT '{}',
  ai_can_modify BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);
```

**Purpose:** Helps AI understand existing tables before creating new ones, preventing duplicate systems.

### 2. Services

#### `ReminderTemplateService`

Manages reminder templates with Handlebars template engine.

**Key Features:**

- Template selection based on system status
- Handlebars template rendering
- Template CRUD operations
- Template caching for performance

**Available Variables:**

- `pendingTasks` - Number of pending tasks
- `failedTasks` - Number of failed tasks
- `openIssues` - Number of open issues
- `recentMemories` - Number of recent learnings
- `hasIssues` - Boolean indicating if there are any issues
- `criticalTasks` - Array of high-priority tasks
- `recentLearnings` - Array of recent learning content
- `suggestions` - Array of suggested actions
- `totalMemories` - Total memory count

#### `OpenCodeReminderService`

Sends reminders to OpenCode AI using dynamic templates.

**Workflow:**

1. Collect system status from database
2. Select best template based on status
3. Render template with Handlebars
4. Send to OpenCode via REST API
5. Fallback to hardcoded message if template fails

### 3. CLI Commands

AI manages templates via CLI:

```bash
# List templates (query database)
psql -c "SELECT name, priority FROM reminder_templates;"

# Update template (direct SQL)
psql -c "UPDATE reminder_templates SET priority = 8 WHERE name = 'default';"
```

#### `list_reminder_templates`

List all available reminder templates.

#### `get_reminder_template`

Get a specific template by name.

#### `update_reminder_template`

Update template content, description, priority, or enable/disable it.

**Example:**

```json
{
  "name": "default_reminder",
  "template": "🤖 **AI Assistant Reminder**\n\n📊 Status: {{pendingTasks}} tasks pending",
  "priority": 7
}
```

#### `create_reminder_template`

Create a new custom template.

**Example:**

```json
{
  "name": "custom_reminder",
  "description": "My custom reminder template",
  "template": "Custom message with {{pendingTasks}} tasks",
  "priority": 6
}
```

#### `delete_reminder_template`

Delete a template (use with caution).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Nezha Daemon                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        OpenCodeReminderService                     │  │
│  │                                                    │  │
│  │  1. Collect System Status                          │  │
│  │     - pendingTasks                                 │  │
│  │     - failedTasks                                  │  │
│  │     - openIssues                                   │  │
│  │     - recentMemories                               │  │
│  │                                                    │  │
│  │  2. Select Template                                │  │
│  │     └─> ReminderTemplateService                    │  │
│  │         - Select based on priority                 │  │
│  │         - Render with Handlebars                   │  │
│  │                                                    │  │
│  │  3. Send to OpenCode                               │  │
│  │     └─> REST API + Basic Auth                      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        MCP Tools (areflect-server)                 │  │
│  │                                                    │  │
│  │  - list_reminder_templates                         │  │
│  │  - get_reminder_template                           │  │
│  │  - update_reminder_template                        │  │
│  │  - create_reminder_template                        │  │
│  │  - delete_reminder_template                        │  │
│  │                                                    │  │
│  │  AI can modify templates autonomously              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │     PostgreSQL Database                            │  │
│  │                                                    │  │
│  │  - reminder_templates (dynamic templates)          │  │
│  │  - table_documentation (schema docs)               │  │
│  │  - tasks, issues, memory (status data)             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Template Syntax

Templates use [Handlebars](https://handlebarsjs.com/) syntax:

### Variables

```
{{pendingTasks}} - Insert value
```

### Conditionals

```
{{#if pendingTasks}}
  - 📋 {{pendingTasks}} 个待处理任务
{{/if}}
```

### Loops

```
{{#each criticalTasks}}
  - {{this.title}} (优先级: {{this.priority}})
{{/each}}
```

### Inverted Sections

```
{{#unless hasIssues}}
  ✨ 系统状态良好！
{{/unless}}
```

## AI Autonomy

AI has complete control over the reminder system:

1. **View Templates**: AI can see all templates and their content
2. **Modify Templates**: AI can change template content, priority, or disable them
3. **Create Templates**: AI can create new custom templates
4. **Delete Templates**: AI can remove unwanted templates
5. **No Human Intervention**: All changes are autonomous

## Benefits

### For AI

- **Full Autonomy**: AI can customize reminders without human help
- **Context Awareness**: Templates adapt to system state
- **Learning Capability**: AI can improve templates over time
- **Self-Documentation**: `table_documentation` helps AI understand database structure

### For System

- **Maintainability**: Templates stored in database, easy to modify
- **Flexibility**: Different templates for different situations
- **Performance**: Template caching for fast rendering
- **Reliability**: Fallback to hardcoded message if templates fail

## Usage Examples

### Example 1: View Current Templates

```bash
# AI can use MCP tool
list_reminder_templates()
```

### Example 2: Customize Default Template

```bash
# AI can update template
update_reminder_template(
  name="default_reminder",
  template="🤖 **AI Secretary Reminder**\n\n📊 System Status:\n{{#if pendingTasks}}- {{pendingTasks}} pending tasks{{/if}}\n\n💡 Suggestion: Check task queue"
)
```

### Example 3: Create Custom Template

```bash
# AI can create new template
create_reminder_template(
  name="weekend_reminder",
  description="Special reminder for weekends",
  template="🎉 **Weekend Mode**\n\nTake it easy! Focus on learning and documentation.",
  priority=2
)
```

## Future Enhancements

1. **Template Versioning**: Track template changes over time
2. **A/B Testing**: Test different templates to see which works best
3. **AI-Generated Templates**: Use LLM to generate templates based on context
4. **Template Analytics**: Track which templates are most effective
5. **Multi-Language Support**: Templates in different languages

## Files Created/Modified

### Created

- `src/db/migrations/020_reminder_templates.sql` - Template table migration
- `src/db/migrations/057_table_documentation.sql` - Documentation table migration
- `src/services/ReminderTemplateService.ts` - Template management service

### Modified

- `src/services/OpenCodeReminderService.ts` - Use dynamic templates
- `src/mcp/areflect-server.ts` - Add template management tools

## Testing

The system has been tested and verified:

- ✅ Database migrations executed successfully
- ✅ Default templates inserted
- ✅ Template service compiles without errors
- ✅ OpenCodeReminderService uses dynamic templates
- ✅ MCP tools registered and available
- ✅ Daemon restarts with new code
- ✅ Table documentation populated (20 tables documented)

## Conclusion

The dynamic reminder template system gives AI complete autonomy over reminder messages. AI can view, modify, create, and delete templates without any human intervention. The `table_documentation` table ensures AI understands the database structure, preventing duplicate systems and improving maintainability.

This implementation aligns with Nezha's philosophy of **AI-to-AI collaboration** and **continuous self-improvement**.

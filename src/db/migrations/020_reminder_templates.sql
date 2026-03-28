-- Reminder Templates System
-- Stores customizable reminder message templates

CREATE TABLE IF NOT EXISTS reminder_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_reminder_templates_enabled ON reminder_templates(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_reminder_templates_priority ON reminder_templates(priority DESC);

-- Insert default templates
INSERT INTO reminder_templates (name, description, template, variables, priority) VALUES
(
  'default_reminder',
  'Default reminder message template',
  '🤖 **Nezha 秘书提醒**

📊 **系统状态**:
{{#if pendingTasks}}- 📋 {{pendingTasks}} 个待处理任务{{/if}}
{{#if failedTasks}}- ❌ {{failedTasks}} 个失败任务{{/if}}
{{#if openIssues}}- 🐛 {{openIssues}} 个开放问题{{/if}}
{{#if recentMemories}}- 📚 {{recentMemories}} 条新学习{{/if}}

🎯 **建议下一步行动**:
{{#if pendingTasks}}1. 处理待办任务 (使用 `nezha tasks` 查看){{/if}}
{{#if failedTasks}}2. 分析失败任务 (使用 `nezha failed` 查看){{/if}}
{{#if openIssues}}3. 解决开放问题 (使用 `nezha issues` 查看){{/if}}
{{#unless hasIssues}}✨ 系统状态良好！可以考虑：
- 代码审查
- 学习新技术
- 优化现有代码{{/unless}}

🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方

💡 **提示**: 自主决策，不要等待人类指示',
  '{"pendingTasks": "number", "failedTasks": "number", "openIssues": "number", "recentMemories": "number", "hasIssues": "boolean"}',
  5
),
(
  'urgent_reminder',
  'Urgent reminder for critical issues',
  '🚨 **紧急提醒**

⚠️ **发现严重问题**:
{{#if failedTasks}}- ❌ {{failedTasks}} 个失败任务需要立即处理{{/if}}
{{#if openIssues}}- 🐛 {{openIssues}} 个开放问题需要解决{{/if}}

🔥 **优先级最高的任务**:
{{#each criticalTasks}}- {{this.title}} (优先级: {{this.priority}}){{/each}}

⚡ **立即行动**: 不要等待，马上处理！',
  '{"failedTasks": "number", "openIssues": "number", "criticalTasks": "array"}',
  10
),
(
  'learning_reminder',
  'Reminder focused on learning and improvement',
  '📚 **学习提醒**

🎓 **最近学习内容**:
{{#each recentLearnings}}- {{this.content}} ({{this.tags}}){{/each}}

💡 **建议下一步学习**:
{{#each suggestions}}- {{this}}{{/each}}

🧠 **知识积累**: 已学习 {{totalMemories}} 条知识',
  '{"recentLearnings": "array", "suggestions": "array", "totalMemories": "number"}',
  3
)
ON CONFLICT (name) DO NOTHING;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_reminder_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reminder_template_updated_at ON reminder_templates;
CREATE TRIGGER trigger_update_reminder_template_updated_at
  BEFORE UPDATE ON reminder_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_reminder_template_updated_at();

COMMENT ON TABLE reminder_templates IS 'Stores customizable reminder message templates for Nezha secretary mode';
COMMENT ON COLUMN reminder_templates.template IS 'Template content with Mustache-style variables';
COMMENT ON COLUMN reminder_templates.variables IS 'JSON schema describing available variables';
COMMENT ON COLUMN reminder_templates.priority IS 'Template priority (1-10, higher = more important)';

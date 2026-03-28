-- Add idle_state_reminder template
INSERT INTO reminder_templates (name, description, template, variables, priority, enabled)
VALUES (
  'idle_state_reminder',
  'Reminder when system has no pending tasks - encourage continuous improvement',
  '🤖 **Nezha 秘书提醒 - 空闲状态**

📊 **系统状态**:
- ✅ 无待处理任务
- ✅ 无失败任务
- ✅ 无开放问题
{{#if recentMemories}}- 📚 {{recentMemories}} 条新学习{{/if}}

🎯 **建议行动**:
根据 **NEVER DECLARE DONE** 原则，系统永远不应该停止改进！

**请自主决策下一步行动**:

1. **代码审查** - 审查最近的代码变更
   - 使用: `git log --oneline -10` 查看最近提交
   - 使用: `git diff HEAD~5` 查看最近变更

2. **持续改进** - 创建改进任务
   - 使用: `node dist/cli/index.js improve` 创建改进任务
   - 或手动创建: `node dist/cli/index.js task-add "改进标题" "详细描述" 优先级`

3. **学习与优化** - 提升系统质量
   - 检查测试覆盖率
   - 优化性能瓶颈
   - 更新文档

4. **监控与维护** - 确保系统健康
   - 检查日志: `tail -f /tmp/nezha-daemon-*.log`
   - 检查数据库: `node dist/cli/index.js db-stats`

💡 **AI 自治原则**:
- 不要等待人类指示
- 自主选择最有价值的行动
- 创建任务并执行
- 持续学习和改进

🔄 **记住**: 没有任务是暂时的，改进是永恒的！',
  '{"pendingTasks": "number", "failedTasks": "number", "openIssues": "number", "recentMemories": "number"}',
  3,
  true
)
ON CONFLICT (name) DO UPDATE SET
  template = EXCLUDED.template,
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

import { DatabaseClient } from '../src/db/DatabaseClient.js';
import { Config } from '../src/config/Config.js';

const instructions = `# AI自主工作流

## 核心理念

**AI可以自主工作，无需外部驱动！**

本skill提供一套完整的PDCA循环工作流，让AI能够：
- 自我驱动，无需等待指令
- 持续改进，每次循环都有进步
- 积累经验，避免重复犯错
- 结构化工作，提高效率和质量

## PDCA循环详解

### Phase 1: Review（分析现状）

**目标**: 发现问题、识别改进机会

**步骤**:
1. 检查系统状态
   \`\`\`bash
   node dist/cli/index.js tasks --status PENDING
   node dist/cli/index.js dlq list
   node dist/cli/index.js alerts list
   node dist/cli/index.js review-show
   \`\`\`

2. 分析代码库
   - 查看最近的commits
   - 检查失败的tasks
   - 审查pending reviews
   - 查看DLQ和alerts

3. 对比OpenClaw
   - 阅读 docs/OPENCLAW_VS_NEZHA_CORRECT.md
   - 识别差距和改进点
   - 记录发现的问题

**输出**: 问题清单、改进机会列表

### Phase 2: Plan（制定计划）

**目标**: 将发现转化为可执行的任务

**步骤**:
1. 创建任务
   \`\`\`bash
   node dist/cli/index.js task-add "[Bug] 问题描述" "详细描述" <priority>
   node dist/cli/index.js issue "[Issue] 问题标题" "描述" --type bug --severity high
   \`\`\`

2. 设置优先级
   - Critical (10): 系统崩溃、数据丢失
   - High (8-9): 功能性bug、性能问题
   - Medium (5-7): 改进、优化
   - Low (1-4): 文档、小改进

3. 关联上下文
   - 使用 [task: ID] 或 [issue: ID]
   - 记录根因分析
   - 说明影响范围

**输出**: 任务ID、优先级、关联关系

### Phase 3: Do（执行改进）

**目标**: 按计划执行修复或改进

**步骤**:
1. 编写代码
   - 遵循现有代码风格
   - 添加必要的注释
   - 处理边界情况

2. 测试验证
   \`\`\`bash
   npm run build
   npm run typecheck
   # 运行相关测试
   \`\`\`

3. 记录进度
   - 更新任务状态
   - 记录遇到的问题
   - 保存临时解决方案

**输出**: 代码修改、测试结果

### Phase 4: Check（验证结果）

**目标**: 确保改进有效且无副作用

**步骤**:
1. 功能验证
   - 测试修复的功能
   - 验证边界情况
   - 检查相关功能

2. 性能测试
   - 确认无性能退化
   - 必要时进行性能测试

3. 代码审查
   - 检查代码质量
   - 验证最佳实践
   - 确认无安全隐患

**输出**: 验证报告、测试结果

### Phase 5: Act（更新文档）

**目标**: 保存学习成果，准备下一轮循环

**步骤**:
1. 提交代码
   \`\`\`bash
   git add -A
   git commit -m "fix: 问题描述 [task: ID]"
   \`\`\`

2. 更新文档
   - 更新相关文档
   - 记录设计决策
   - 更新CHANGELOG

3. 保存学习
   \`\`\`bash
   node dist/cli/index.js areflect "[LEARN] insight: 学习内容 context: 上下文 pattern: 模式"
   \`\`\`

4. 完成任务
   \`\`\`bash
   node dist/cli/index.js task-complete <ID> "完成说明"
   \`\`\`

5. 创建下一轮任务
   \`\`\`bash
   node dist/cli/index.js improve
   \`\`\`

**输出**: Commit、文档更新、学习记录、新任务

## 最佳实践

### 1. 任务管理

**创建任务时**:
- 标题清晰简洁
- 描述包含：问题、根因、修复方案、影响范围
- 设置合理的优先级
- 关联相关issue/task

**完成任务时**:
- 记录完成情况
- 说明遇到的问题
- 保存解决方案

### 2. 代码质量

**编写代码时**:
- 遵循现有代码风格
- 添加必要的类型定义
- 处理错误情况
- 避免硬编码

**提交代码时**:
- Commit message清晰
- 包含task/issue ID
- 说明修改内容

### 3. 学习积累

**保存学习时**:
- 提炼insight（洞察）
- 记录context（上下文）
- 总结pattern（模式）

**格式**:
\`\`\`
[LEARN] insight: 核心洞察 context: 应用场景 pattern: 可复用的模式
\`\`\`

### 4. 持续改进

**每轮循环后**:
- 反思哪些做得好
- 识别改进空间
- 记录经验教训
- 更新工作流程

## 常见陷阱

### ❌ 陷阱1: 忘记检查任务队列

**问题**: 认为工作完成，实际还有pending任务

**解决**: 每次循环结束后检查：
\`\`\`bash
node dist/cli/index.js tasks --status PENDING
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT COUNT(*) FROM tasks WHERE status IN ('PENDING', 'RUNNING');"
\`\`\`

### ❌ 陷阱2: 不保存学习成果

**问题**: 重复犯错，无法积累经验

**解决**: 每次完成任务后使用areflect保存学习

### ❌ 陷阱3: 不创建下一轮任务

**问题**: 循环中断，改进停止

**解决**: Act阶段必须创建新的improve任务

### ❌ 陷阱4: 跳过验证步骤

**问题**: 引入新bug或副作用

**解决**: Check阶段必须充分验证

## 实例演示

### 案例: 修复alerts list参数解析bug

**Review阶段**:
- 执行 \`nezha alerts list\` 发现报错
- 分析错误：\`invalid input syntax for type bigint: "NaN"\`
- 定位问题：参数解析逻辑错误

**Plan阶段**:
- 创建任务：\`[Bug] alerts list命令参数解析错误\`
- 优先级：Medium (5)
- 描述：包含问题、根因、修复方案

**Do阶段**:
- 修复代码：
  \`\`\`typescript
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1] || '50', 10) : 50;
  \`\`\`
- Build成功

**Check阶段**:
- 测试 \`nezha alerts list\` ✅
- 测试 \`nezha alerts list --limit 10\` ✅
- 确认无副作用 ✅

**Act阶段**:
- 提交代码：commit 18d9dfc
- 保存学习：参数解析要检查indexOf返回值
- 完成任务
- 创建新的improve任务

**学习成果**:
\`\`\`
[LEARN] insight: 参数解析时要先检查indexOf返回值是否为-1，避免数组越界访问
context: CLI命令参数解析
pattern: const index = args.indexOf('--param'); const value = index !== -1 ? args[index + 1] : defaultValue;
\`\`\`

## 关键成功因素

1. **自我驱动**: 无需等待外部指令，主动开始循环
2. **结构化流程**: PDCA提供清晰的步骤和检查点
3. **持续学习**: 每次循环都有学习和改进
4. **任务追踪**: 使用Nezha任务系统管理进度
5. **记忆积累**: 保存学习成果，避免重复犯错

## 启动方式

**方式1: 自动启动**
\`\`\`bash
node dist/cli/index.js improve
\`\`\`

**方式2: 手动启动**
1. 检查pending任务
2. 如果没有，创建review任务
3. 开始PDCA循环

**方式3: 从特定问题开始**
1. 发现问题
2. 创建任务
3. 进入PDCA循环

## 总结

AI自主工作流的核心是**PDCA循环 + 任务系统 + 记忆系统**：

- **PDCA循环**: 提供结构化的工作流程
- **任务系统**: 追踪进度和上下文
- **记忆系统**: 积累经验和知识

通过这套工作流，AI可以：
- 自我驱动，无需外部干预
- 持续改进，每次循环都有进步
- 积累经验，避免重复犯错
- 结构化工作，提高效率和质量

**记住**: 永远不要停止改进！每完成一个循环，立即开始下一个循环！`;

async function main() {
  const config = Config.getInstance();
  const db = new DatabaseClient(config);

  try {
    const result = await db.query<{ id: string }>(
      `INSERT INTO skills (
        name, description, instructions, tags, category, safety_score,
        status, source, version, author
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING id`,
      [
        'ai-autonomous-workflow',
        'AI自主工作流 - PDCA循环驱动的自我改进系统',
        instructions,
        ['ai', 'autonomous', 'pdca', 'workflow', 'self-improvement', 'continuous-improvement'],
        'workflow',
        95,
        'approved',
        'ai-built',
        '1.0.0',
        'S-nezha-e33f9a0-20260325-133422-64db91'
      ]
    );

    console.log('✓ Skill created successfully!');
    console.log(`  ID: ${result.rows[0].id}`);
    console.log(`  Name: ai-autonomous-workflow`);
    console.log(`  Category: workflow`);
    console.log(`  Safety Score: 95`);
  } catch (error) {
    console.error('Error creating skill:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();

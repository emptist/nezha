# Learning Memory Metabolism - 学习记忆新陈代谢

> **灵感来源**: OpenClaw, CoffeeClaw, Everything-Claude-Code
> **创建日期**: 2026-03-28
> **更新日期**: 2026-03-29
> **状态**: 提案

## 问题

随着时间推移，`memory` 表中的学习记录会越来越多：

| 时间 | 记录数 | 问题 |
|------|--------|------|
| 1 个月 | ~100 | 无问题 |
| 3 个月 | ~500 | 搜索变慢 |
| 6 个月 | ~2000 | 噪音增加 |
| 1 年 | ~5000+ | 信息过载 |

**核心矛盾**：
- 旧知识可能过时，但有些是"永恒真理"
- 新知识更有价值，但需要历史上下文
- 不能简单删除，需要智能衰减

---

## 解决方案：时间衰减 + 分类标记

### 方案 1: 时间衰减 (Temporal Decay)

参考 OpenClaw 实现：

```typescript
type TemporalDecayConfig = {
  enabled: boolean;
  halfLifeDays: number;  // 半衰期（天）
};

// 计算衰减系数
function calculateTemporalDecayMultiplier(ageInDays: number, halfLifeDays: number): number {
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * ageInDays);
}

// 示例：半衰期 30 天
// 0 天 -> 1.0 (100%)
// 30 天 -> 0.5 (50%)
// 60 天 -> 0.25 (25%)
// 90 天 -> 0.125 (12.5%)
```

**实现方式**：

```sql
-- 添加衰减分数列
ALTER TABLE memory ADD COLUMN IF NOT EXISTS decay_score FLOAT DEFAULT 1.0;

-- 更新衰减分数（定期任务）
UPDATE memory 
SET decay_score = EXP(-0.0231 * EXTRACT(DAY FROM NOW() - created_at))
WHERE decay_score > 0.01;

-- 搜索时加权
SELECT *, 
  (similarity_score * decay_score) as final_score
FROM memory
ORDER BY final_score DESC
LIMIT 10;
```

### 方案 2: 分类标记 (Evergreen vs Temporal)

区分"永恒知识"和"临时知识"：

```typescript
type MemoryType = 'evergreen' | 'temporal' | 'deprecated';

// Evergreen: 永恒知识，不衰减
// - 架构原则
// - 核心模式
// - 最佳实践

// Temporal: 临时知识，会衰减
// - 具体问题解决方案
// - 版本特定的配置
// - 当前状态描述

// Deprecated: 已废弃，可清理
// - 过时的方法
// - 已修复的 bug 记录
```

**实现方式**：

```sql
-- 添加记忆类型列
ALTER TABLE memory ADD COLUMN IF NOT EXISTS memory_type VARCHAR(20) DEFAULT 'temporal';

-- Evergreen 记忆不衰减
UPDATE memory SET decay_score = 1.0 WHERE memory_type = 'evergreen';

-- Deprecated 记录可归档
DELETE FROM memory 
WHERE memory_type = 'deprecated' 
AND created_at < NOW() - INTERVAL '90 days';
```

### 方案 3: 重要性评分 (Importance Score)

基于使用频率和反馈调整重要性：

```sql
-- 添加重要性列
ALTER TABLE memory ADD COLUMN IF NOT EXISTS importance FLOAT DEFAULT 0.5;
ALTER TABLE memory ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;

-- 访问时增加计数
UPDATE memory 
SET access_count = access_count + 1, 
    importance = LEAST(1.0, importance + 0.05)
WHERE id = $1;

-- 最终分数 = 相关性 * 衰减 * 重要性
SELECT *, 
  (similarity_score * decay_score * importance) as final_score
FROM memory
ORDER BY final_score DESC;
```

---

## 推荐实现路径

### Phase 1: 数据库扩展（低风险）

```sql
-- Migration: 065_memory_metabolism.sql

-- 1. 添加新列
ALTER TABLE memory 
ADD COLUMN IF NOT EXISTS memory_type VARCHAR(20) DEFAULT 'temporal',
ADD COLUMN IF NOT EXISTS decay_score FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS importance FLOAT DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_decay ON memory(decay_score);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory(importance DESC);

-- 3. 标记永恒知识（基于标签）
UPDATE memory 
SET memory_type = 'evergreen', decay_score = 1.0
WHERE tags && ARRAY['architecture', 'principle', 'pattern', 'best-practice'];

-- 4. 标记废弃知识（基于标签）
UPDATE memory 
SET memory_type = 'deprecated'
WHERE tags && ARRAY['deprecated', 'obsolete', 'fixed', 'resolved'];
```

### Phase 2: 衰减计算服务（中风险）

```typescript
// src/services/MemoryMetabolismService.ts

export class MemoryMetabolismService {
  private readonly HALF_LIFE_DAYS = 30;
  
  async updateDecayScores(): Promise<void> {
    await this.db.query(`
      UPDATE memory 
      SET decay_score = EXP(-0.0231 * EXTRACT(DAY FROM NOW() - created_at))
      WHERE memory_type = 'temporal'
      AND decay_score > 0.01
    `);
  }
  
  async archiveDeprecated(): Promise<number> {
    const result = await this.db.query(`
      DELETE FROM memory 
      WHERE memory_type = 'deprecated' 
      AND created_at < NOW() - INTERVAL '90 days'
      RETURNING id
    `);
    return result.rowCount;
  }
  
  async recordAccess(memoryId: string): Promise<void> {
    await this.db.query(`
      UPDATE memory 
      SET access_count = access_count + 1,
          last_accessed_at = NOW(),
          importance = LEAST(1.0, importance + 0.02)
      WHERE id = $1
    `, [memoryId]);
  }
}
```

### Phase 3: 搜索集成（中风险）

```typescript
// 在 Memory.ts 中集成衰减

async search(query: string, options?: { minScore?: number }): Promise<MemoryResult[]> {
  const results = await this.db.query(`
    SELECT *, 
      (similarity(content, $1) * decay_score * importance) as final_score
    FROM memory
    WHERE memory_type != 'deprecated'
    ORDER BY final_score DESC
    LIMIT $2
  `, [query, options?.limit || 10]);
  
  // 记录访问
  for (const r of results.rows) {
    await this.metabolism.recordAccess(r.id);
  }
  
  return results.rows;
}
```

### Phase 4: 定期清理任务（低风险）

```typescript
// 在 Scheduler.ts 中添加定期任务

// 每天凌晨 3 点更新衰减分数
scheduler.addCronJob('0 3 * * *', async () => {
  await metabolism.updateDecayScores();
  const archived = await metabolism.archiveDeprecated();
  logger.info(`[Metabolism] Archived ${archived} deprecated memories`);
});
```

---

## 配置选项

```yaml
# config.yaml

memory:
  metabolism:
    enabled: true
    half_life_days: 30        # 半衰期
    min_decay_score: 0.01     # 最低保留分数
    archive_after_days: 90    # 废弃记录归档天数
    
  types:
    evergreen_tags:
      - architecture
      - principle
      - pattern
      - best-practice
    deprecated_tags:
      - deprecated
      - obsolete
      - fixed
      - resolved
```

---

## 效果预期

| 指标 | 当前 | 实施后 |
|------|------|--------|
| 搜索速度 | 基准 | 提升 30% |
| 结果相关性 | 基准 | 提升 50% |
| 噪音比例 | 高 | 降低 70% |
| 存储空间 | 增长 | 稳定 |

---

## 参考

- OpenClaw `src/memory/temporal-decay.ts` - 时间衰减实现
- OpenClaw `src/memory/mmr.ts` - 多样性重排序 (MMR)
- CoffeeClaw `skills/memory-enhancer/SKILL.md` - 记忆增强器
- Everything-Claude-Code `skills/continuous-learning-v2/SKILL.md` - 持续学习系统
- Nezha `docs/systems/MEMORY_SYSTEM.md` - 当前记忆系统设计

---

## 参考项目详细分析

### 1. OpenClaw 记忆管理

**核心机制**：

| 功能 | 实现 | 文件 |
|------|------|------|
| MMR 重排序 | Jaccard 相似度 + λ 权衡 | `src/memory/mmr.ts` |
| 时间衰减 | 指数衰减函数 | `src/memory/temporal-decay.ts` |
| 混合搜索 | SQLite + 向量嵌入 | `src/memory/hybrid.ts` |

**MMR 算法核心**：
```typescript
// MMR = λ * relevance - (1-λ) * max_similarity_to_selected
function computeMMRScore(relevance, maxSimilarity, lambda) {
  return lambda * relevance - (1 - lambda) * maxSimilarity;
}
```

**关键参数**：
- `lambda: 0.7` - 平衡相关性与多样性
- `enabled: false` - 默认关闭，需显式启用

### 2. CoffeeClaw 记忆增强器

**核心功能**：

| 功能 | 说明 |
|------|------|
| 自动标签分类 | 技术/业务/类型/优先级标签 |
| 关键信息提取 | 决策点、待办、问题、经验 |
| 语义搜索 | 关键词、语义、时间、标签组合 |
| 记忆关联 | 相关决策、依赖关系、主题聚类 |
| 记忆摘要 | 每日、每周、项目摘要 |

**记忆文件类型**：
- `CONTEXT.md` - 当前上下文
- `DECISIONS.md` - 决策记录
- `MEMORY.md` - 项目记忆
- `PROGRESS.md` - 进度追踪
- `TODO.md` - 待办事项

**索引结构**：
```json
{
  "entries": [{
    "id": "uuid",
    "type": "decision",
    "tags": ["#architecture"],
    "timestamp": "2026-03-10T15:30:00Z",
    "related": ["uuid1", "uuid2"]
  }]
}
```

**更新策略**：
- 实时更新 - 记忆文件变化时
- 定时更新 - 每小时完整重建
- 手动更新 - 用户触发

### 3. Everything-Claude-Code 持续学习 v2.1

**核心概念：Instinct (本能)**

```yaml
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
scope: project  # 或 global
```

**置信度演化**：

| 分数 | 含义 | 行为 |
|------|------|------|
| 0.3 | 试探性 | 建议但不强制 |
| 0.5 | 中等 | 相关时应用 |
| 0.7 | 强 | 自动批准应用 |
| 0.9 | 近确定 | 核心行为 |

**作用域决策**：

| 模式类型 | 作用域 | 示例 |
|----------|--------|------|
| 语言/框架约定 | project | "Use React hooks" |
| 文件结构偏好 | project | "Tests in __tests__/" |
| 安全实践 | global | "Validate user input" |
| 工具工作流 | global | "Grep before Edit" |

**晋升机制**：
- 同一本能在 2+ 项目出现
- 平均置信度 >= 0.8
- 自动晋升为全局

### 4. 综合对比

| 特性 | OpenClaw | CoffeeClaw | ECC v2.1 | Nezha 建议 |
|------|----------|------------|----------|------------|
| 时间衰减 | ✅ 指数 | ❌ | ❌ | ✅ 采用 |
| 置信度 | ❌ | ❌ | ✅ 0.3-0.9 | ✅ 采用 |
| 作用域 | ❌ | ❌ | ✅ project/global | ✅ 采用 |
| MMR 多样性 | ✅ | ❌ | ❌ | ✅ 可选 |
| 自动标签 | ❌ | ✅ | ✅ domain | ✅ 采用 |
| 访问计数 | ❌ | ❌ | ❌ | ✅ 采用 |
| 晋升机制 | ❌ | ❌ | ✅ | ✅ 采用 |

---

## 下一步

1. 创建 migration 文件
2. 实现 MemoryMetabolismService
3. 更新 Memory.ts 搜索方法
4. 添加定期任务
5. 监控效果并调整参数

# Nezha Memory System Development Plan

**创建时间**: 2026-03-16  
**状态**: 综合评估与最优计划

---

## 📊 当前状态评估

### 1. OpenClaw 记忆系统（标杆）

**成熟度**: ⭐⭐⭐⭐⭐ (5/5)

**核心能力**:
```
✅ 向量搜索 (Vector Search)
   - Embedding 向量化
   - 语义相似度搜索
   - 支持多种维度

✅ 关键词搜索 (Keyword Search)
   - BM25 算法
   - FTS5 全文索引
   - 查询扩展

✅ 混合搜索 (Hybrid Search)
   - 向量 + 关键词加权合并
   - 可配置权重
   - 更准确的检索

✅ MMR 重排序
   - 平衡相关性和多样性
   - Jaccard 相似度
   - 避免重复结果

✅ 时间衰减
   - 半衰期机制
   - 常青记忆支持
   - 自动老化

✅ Embedding 提供商
   - OpenAI (text-embedding-3-small/large)
   - Gemini (text-embedding-004)
   - Voyage (voyage-3-large)
   - Mistral (mistral-embed)
   - Ollama (本地模型)

✅ 完整生态
   - 文件监控
   - 缓存机制
   - 批量处理
   - 会话管理
```

**技术栈**:
- SQLite (node:sqlite)
- FTS5 全文索引
- 向量存储 (BLOB)
- 文件系统监控 (chokidar)

### 2. Nezha 当前记忆系统

**成熟度**: ⭐ (1/5)

**核心能力**:
```
✅ 基础 CRUD
   - save()
   - search() (ILIKE)
   - getByProject()
   - getById()
   - deleteOldMemories()

✅ 项目关联
   - project_id 字段
   - 基础跨项目查询

❌ 缺失功能
   - 无向量搜索
   - 无关键词搜索 (FTS)
   - 无混合搜索
   - 无 MMR 重排序
   - 无时间衰减
   - 无 Embedding 支持
   - 无缓存机制
   - 无文件监控
```

**技术栈**:
- PostgreSQL
- 简单 ILIKE 搜索
- 无索引优化

### 3. Nezha 设计的记忆系统

**成熟度**: 设计中

**创新功能**:
```
✅ 知识关联
   - memory_links 表
   - 关系类型
   - 知识网络

✅ 重要性评分
   - importance 字段 (1-10)
   - 动态调整
   - 优先级管理

✅ 知识交接班
   - KNOWLEDGE.md
   - SQL 动态注入
   - 跨 Session 记忆

✅ 去知识泡沫
   - 自动清理
   - 低价值知识过滤
   - 定期维护

✅ 跨项目共享
   - PostgreSQL 统一存储
   - 项目关联
   - 知识复用
```

---

## 🎯 核心目标

### 1. 学习 OpenClaw 的核心功能

**必须实现**:
- 向量搜索
- 混合搜索
- Embedding 支持

**应该实现**:
- MMR 重排序
- 时间衰减
- 缓存机制

### 2. 保持 Nezha 的独特优势

**核心优势**:
- 跨项目共享
- 知识关联
- 重要性评分

### 3. 创新知识管理

**创新功能**:
- 知识交接班
- 去知识泡沫

---

## 📋 开发方案对比

### 方案 A: 完全模仿 OpenClaw

**策略**: 直接移植 OpenClaw 的记忆系统

**实施步骤**:
```
1. 使用 SQLite 替代 PostgreSQL
2. 实现向量搜索 (BLOB 存储)
3. 实现 FTS5 全文索引
4. 实现混合搜索
5. 实现 MMR 重排序
6. 实现时间衰减
7. 添加 Embedding 提供商
```

**优点**:
- ✅ 技术成熟，风险低
- ✅ 可以直接参考代码
- ✅ 实施速度快

**缺点**:
- ❌ 失去 PostgreSQL 的优势
- ❌ 失去跨项目共享能力
- ❌ 失去 Nezha 的独特性
- ❌ 不符合 Nezha 的设计哲学

**评分**: ⭐⭐ (2/5)

---

### 方案 B: 渐进式增强（推荐）

**策略**: 在现有 PostgreSQL 基础上，逐步添加功能

**实施步骤**:
```
Phase 1: 基础增强 (2-3 周)
├── 添加 pgvector 扩展
├── 实现 Embedding 支持
├── 实现向量搜索
└── 实现混合搜索

Phase 2: 高级功能 (2-3 周)
├── 添加 PostgreSQL FTS
├── 实现 MMR 重排序
├── 实现时间衰减
└── 添加缓存机制

Phase 3: 创新功能 (2-3 周)
├── 实现知识关联
├── 实现重要性评分
├── 实现知识交接班
└── 实现去知识泡沫
```

**优点**:
- ✅ 保持 PostgreSQL 优势
- ✅ 保持跨项目共享能力
- ✅ 学习 OpenClaw 核心功能
- ✅ 保持 Nezha 独特性
- ✅ 风险可控，可回滚

**缺点**:
- ⚠️ 实施周期较长
- ⚠️ 需要学习 pgvector
- ⚠️ 需要适配 PostgreSQL

**评分**: ⭐⭐⭐⭐⭐ (5/5)

---

### 方案 C: 混合架构

**策略**: SQLite 用于本地缓存，PostgreSQL 用于持久化

**实施步骤**:
```
1. 本地使用 SQLite + pgvector
2. 远程使用 PostgreSQL
3. 实现同步机制
4. 实现混合搜索
5. 添加所有功能
```

**优点**:
- ✅ 兼顾性能和持久化
- ✅ 支持离线工作
- ✅ 支持跨项目共享

**缺点**:
- ❌ 架构复杂
- ❌ 同步机制复杂
- ❌ 维护成本高
- ❌ 可能引入 bug

**评分**: ⭐⭐⭐ (3/5)

---

### 方案 D: 最小可行产品 (MVP)

**策略**: 只实现最核心的功能

**实施步骤**:
```
1. 添加 pgvector 扩展
2. 实现向量搜索
3. 实现知识交接班
```

**优点**:
- ✅ 快速上线
- ✅ 风险最低
- ✅ 可以快速验证

**缺点**:
- ❌ 功能不完整
- ❌ 无法达到 OpenClaw 水平
- ❌ 用户体验差

**评分**: ⭐⭐⭐ (3/5)

---

## 🏆 最优计划：方案 B（渐进式增强）

### 为什么选择方案 B？

```
1. 平衡性最好
   - 学习 OpenClaw 核心功能 ✅
   - 保持 Nezha 独特优势 ✅
   - 风险可控 ✅

2. 技术栈一致
   - 继续使用 PostgreSQL ✅
   - 利用 pgvector 扩展 ✅
   - 利用 PostgreSQL FTS ✅

3. 渐进式开发
   - 分阶段实施 ✅
   - 每个阶段可独立测试 ✅
   - 可随时调整 ✅

4. 符合设计哲学
   - 跨项目共享 ✅
   - 知识管理创新 ✅
   - 持久化学习 ✅
```

---

## 📅 实施顺序（按优先级和依赖关系）

### Phase 1: 基础增强

**优先级**: 最高  
**依赖**: 无  
**目标**: 建立向量搜索基础

#### Step 1: 数据库准备

**任务**:
```
1. 安装 pgvector 扩展
   CREATE EXTENSION IF NOT EXISTS vector;

2. 修改 memories 表结构
   ├── 添加 embedding 字段 (vector(1536))
   ├── 添加 tags 字段 (text[])
   ├── 添加 importance 字段 (int)
   └── 添加 source 字段 (text)

3. 创建向量索引
   CREATE INDEX ON memories USING ivfflat (embedding vector_cosine_ops);

4. 创建迁移脚本
```

**交付物**:
- ✅ pgvector 扩展安装
- ✅ memories 表结构更新
- ✅ 向量索引创建

#### Step 2: Embedding 提供商

**任务**:
```
1. 创建 EmbeddingProvider 接口
2. 实现 OpenAI Embedding
3. 实现 Ollama Embedding (本地)
4. 添加配置管理
```

**交付物**:
- ✅ Embedding 提供商接口
- ✅ OpenAI + Ollama 实现

#### Step 3: 向量搜索

**任务**:
```
1. 实现 vectorSearch() 方法
2. 实现 cosine similarity 查询
3. 添加测试
```

**交付物**:
- ✅ 向量搜索功能
- ✅ 测试覆盖

#### Step 4: PostgreSQL FTS

**任务**:
```
1. 创建全文索引
   CREATE INDEX ON memories USING gin(to_tsvector('english', content));

2. 实现 keywordSearch() 方法
3. 实现 BM25 排序
4. 添加查询扩展
```

**交付物**:
- ✅ 全文索引
- ✅ 关键词搜索

#### Step 5: 混合搜索

**任务**:
```
1. 实现 hybridSearch() 方法
2. 实现加权合并算法
3. 添加权重配置
4. 添加测试
```

**交付物**:
- ✅ 混合搜索功能
- ✅ 性能优化

#### Step 6: MMR 重排序

**任务**:
```
1. 实现 MMR 算法
2. 实现 Jaccard 相似度
3. 添加配置参数
4. 添加测试
```

**交付物**:
- ✅ MMR 重排序功能

#### Step 7: 时间衰减

**任务**:
```
1. 实现时间衰减算法
2. 添加半衰期配置
3. 支持常青记忆
4. 添加测试
```

**交付物**:
- ✅ 时间衰减功能

---

### Phase 2: 高级功能

**优先级**: 高  
**依赖**: Phase 1 完成  
**目标**: 提高性能和易用性

#### Step 8: Embedding 缓存

**任务**:
```
1. 创建 embedding_cache 表
2. 实现缓存逻辑
3. 添加缓存失效策略
4. 添加测试
```

**交付物**:
- ✅ Embedding 缓存机制

#### Step 9: 查询缓存

**任务**:
```
1. 实现查询结果缓存
2. 添加缓存失效
3. 性能测试
```

**交付物**:
- ✅ 查询缓存机制

#### Step 10: Memory Skills API

**任务**:
```
1. memory_save (增强版)
2. memory_search (混合搜索)
3. memory_link (知识关联)
4. memory_get (详情)
5. memory_update (更新)
6. memory_delete (删除)
7. 添加批量操作
8. 添加测试
```

**交付物**:
- ✅ 完整 API
- ✅ 批量操作

#### Step 11: 文件监控

**任务**:
```
1. 实现 memory/ 目录监控
2. 自动解析 MEMORY.md
3. 自动更新索引
4. 添加测试
```

**交付物**:
- ✅ 文件监控功能

#### Step 12: 会话管理

**任务**:
```
1. 实现 sessions/ 目录监控
2. 自动解析会话文件
3. 增量更新
4. 添加测试
```

**交付物**:
- ✅ 会话管理功能

---

### Phase 3: 创新功能

**优先级**: 中  
**依赖**: Phase 1 完成  
**目标**: 实现独特创新

#### Step 13: 知识关联

**任务**:
```
1. 创建 memory_links 表
2. 添加关系类型
3. 创建索引
4. 实现自动关联发现
5. 实现相似度计算
6. 添加手动关联
7. 实现知识图谱查询
8. 添加测试
```

**交付物**:
- ✅ 知识关联功能
- ✅ 知识图谱

#### Step 14: 重要性评分

**任务**:
```
1. 实现评分算法
2. 添加动态调整
3. 添加手动评分
4. 添加测试
```

**交付物**:
- ✅ 重要性评分功能

#### Step 15: 知识交接班

**任务**:
```
1. 创建 KNOWLEDGE.md 模板
2. 实现 SQL 动态查询
3. 实现自动更新
4. 添加测试
```

**交付物**:
- ✅ 知识交接班机制

#### Step 16: 去知识泡沫

**任务**:
```
1. 实现低价值知识识别
2. 实现自动清理策略
3. 添加清理配置
4. 实现知识统计
5. 实现知识审计
6. 添加清理日志
7. 添加测试
```

**交付物**:
- ✅ 去知识泡沫功能
- ✅ 维护工具

#### Step 17: 最终测试

**任务**:
```
1. 完整功能测试
2. 性能测试
3. 压力测试
4. 文档完善
```

**交付物**:
- ✅ 完整测试覆盖
- ✅ 完整文档

---

## 📊 成功指标

### Phase 1 完成标准

```
✅ 向量搜索准确率 > 80%
✅ 混合搜索准确率 > 85%
✅ 搜索延迟 < 100ms
✅ 测试覆盖率 > 80%
```

### Phase 2 完成标准

```
✅ 缓存命中率 > 70%
✅ API 响应时间 < 50ms
✅ 文件监控延迟 < 1s
✅ 测试覆盖率 > 85%
```

### Phase 3 完成标准

```
✅ 知识关联准确率 > 75%
✅ 重要性评分相关性 > 80%
✅ 知识交接班可用性 > 95%
✅ 测试覆盖率 > 90%
```

---

## 🚀 下一步行动

### 立即开始

```
1. 创建 feature/memory-enhancement 分支
   git checkout -b feature/memory-enhancement

2. 安装 pgvector 扩展
   CREATE EXTENSION IF NOT EXISTS vector;

3. 更新数据库 Schema
   添加 embedding, tags, importance, source 字段

4. 实现 Embedding 提供商
   OpenAI + Ollama (本地)
```

### 准备工作

```
1. 阅读 pgvector 文档
   https://github.com/pgvector/pgvector

2. 阅读 OpenClaw 记忆系统代码
   /Users/jk/gits/hub/openclaw/src/memory/

3. 准备测试数据
   创建测试用例和测试数据集

4. 设计 API 接口
   参考 MEMORY_SKILLS_API_SPEC.md
```

---

## ✅ 结论

**最优计划**: 方案 B - 渐进式增强

**核心理由**:
1. ✅ 平衡性最好
2. ✅ 风险可控
3. ✅ 保持独特性
4. ✅ 技术栈一致

**预期成果**:
- 学习 OpenClaw 核心功能
- 保持 Nezha 独特优势
- 实现创新知识管理
- 达到生产就绪状态

---

**创建时间**: 2026-03-16  
**更新时间**: 2026-03-16  
**状态**: 去除时间估算，专注优先级和逻辑顺序  
**下一步**: 创建 feature 分支，开始 Step 1 实施

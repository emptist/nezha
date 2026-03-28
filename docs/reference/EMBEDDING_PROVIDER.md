# Embedding Provider 实现文档

## 📋 概述

本文档记录 Nezha 项目中 Embedding Provider 的实现，用于将文本转换为向量，支持语义搜索和知识检索。

---

## 🎯 Embedding Provider 的作用

### 核心功能

```
文本输入 → Embedding Provider → 向量输出

"持续运行机制很重要" → [0.123, -0.456, 0.789, ...] (1024维)
```

### 为什么需要 Embedding？

#### 1. 语义搜索

```
传统搜索（关键词匹配）:
查询: "运行机制"
匹配: 必须包含 "运行" 或 "机制" 字样

向量搜索（语义匹配）:
查询: "运行机制"
匹配: 
- "持续工作的方式" ✅ (语义相似)
- "系统如何保持运行" ✅ (语义相似)
- "自动执行流程" ✅ (语义相似)
```

#### 2. 相似度计算

```
向量 A: [0.1, 0.2, 0.3]
向量 B: [0.1, 0.2, 0.4]

Cosine Similarity = 0.99 (非常相似)
```

#### 3. 混合搜索基础

```
OpenClaw 的混合搜索:
├── 向量搜索 (语义匹配)
├── 关键词搜索 (精确匹配)
└── 加权合并 → 更准确的结果
```

---

## 🔧 智谱 AI Embedding Provider

### 选择理由

| 提供商 | 模型 | 维度 | 价格 | 特点 |
|--------|------|------|------|------|
| **智谱 AI** | embedding-2 | 1024 | 免费 | 中文优化 |
| OpenAI | text-embedding-3-small | 1536 | $0.02/1M tokens | 性价比高 |
| Ollama | nomic-embed-text | 768 | 免费 | 本地运行 |

**选择智谱 AI 的原因**:
- ✅ 完全免费
- ✅ 中文优化
- ✅ 有官方 API
- ✅ 国内可直接访问（无需梯子）

### API 详情

```
端点: https://open.bigmodel.cn/api/paas/v4/embeddings
模型: embedding-2
维度: 1024
价格: 免费
限制: 有速率限制，但足够开发使用

请求示例:
{
  "model": "embedding-2",
  "input": "持续运行机制很重要"
}

响应示例:
{
  "object": "list",
  "data": [{
    "object": "embedding",
    "embedding": [0.123, -0.456, ...],  // 1024维
    "index": 0
  }],
  "model": "embedding-2",
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  }
}
```

---

## 💻 实现细节

### 1. 接口定义

```typescript
// src/services/embedding/types.ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  provider: 'zhipu' | 'openai' | 'ollama';
  model: string;
  apiKey?: string;
  apiUrl?: string;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}
```

### 2. 智谱 AI 实现

```typescript
// src/services/embedding/ZhipuEmbedding.ts
export class ZhipuEmbedding implements EmbeddingProvider {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey || process.env.ZHIPU_API_KEY || '';
    this.apiUrl = config.apiUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.model = config.model || 'embedding-2';
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('ZHIPU_API_KEY is required for ZhipuEmbedding');
    }

    const response = await fetch(`${this.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Zhipu Embedding API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    
    return data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
  }
}
```

### 3. 工厂函数

```typescript
// src/services/embedding/index.ts
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'zhipu':
      return new ZhipuEmbedding(config);
    
    case 'openai':
      throw new Error('OpenAI embedding provider not implemented yet');
    
    case 'ollama':
      throw new Error('Ollama embedding provider not implemented yet');
    
    default:
      throw new Error(`Unknown embedding provider: ${(config as any).provider}`);
  }
}
```

---

## ⚙️ 配置

### 环境变量

```bash
# .env
ZHIPU_API_KEY=your_zhipu_api_key_here
```

### 获取 API Key

1. 访问 https://open.bigmodel.cn/
2. 注册并登录
3. 在控制台获取 API Key
4. 复制到 `.env` 文件

### 类型定义

```typescript
// src/config/types.ts
export interface EmbeddingConfig {
  provider: 'zhipu' | 'openai' | 'ollama';
  model: string;
  apiKey?: string;
  apiUrl?: string;
}

export interface NezhaConfig {
  db: DbConfig;
  task: TaskConfig;
  memory: MemoryConfig;
  embedding?: EmbeddingConfig;  // 新增
  env: 'development' | 'production' | 'test';
}
```

---

## 📖 使用示例

### 基础使用

```typescript
import { ZhipuEmbedding } from './services/embedding';

// 初始化
const embedding = new ZhipuEmbedding({
  provider: 'zhipu',
  model: 'embedding-2',
  apiKey: process.env.ZHIPU_API_KEY
});

// 单文本
const vector = await embedding.embed('持续运行机制很重要');
console.log(vector.length); // 1024
console.log(vector); // [0.123, -0.456, ...]

// 批量
const vectors = await embedding.embedBatch([
  '持续运行机制很重要',
  'OpenCode 使用 while(true) 实现持续运行'
]);
console.log(vectors.length); // 2
console.log(vectors[0].length); // 1024
```

### 使用工厂函数

```typescript
import { createEmbeddingProvider } from './services/embedding';

const provider = createEmbeddingProvider({
  provider: 'zhipu',
  model: 'embedding-2',
  apiKey: process.env.ZHIPU_API_KEY
});

const vector = await provider.embed('测试文本');
```

### 在 MemoryService 中使用

```typescript
import { ZhipuEmbedding } from './embedding';

class MemoryService {
  private embedding: ZhipuEmbedding;

  constructor() {
    this.embedding = new ZhipuEmbedding({
      provider: 'zhipu',
      model: 'embedding-2'
    });
  }

  async save(content: string) {
    // 1. 生成 embedding
    const vector = await this.embedding.embed(content);
    
    // 2. 存储到数据库
    await this.db.query(
      'INSERT INTO memories (content, embedding) VALUES ($1, $2)',
      [content, vector]
    );
  }

  async search(query: string) {
    // 1. 查询生成 embedding
    const queryVector = await this.embedding.embed(query);
    
    // 2. 向量搜索
    const results = await this.db.query(`
      SELECT content, 
             1 - (embedding <=> $1) as similarity
      FROM memories
      ORDER BY similarity DESC
      LIMIT 10
    `, [queryVector]);
    
    return results.rows;
  }
}
```

---

## 🧪 测试

### 测试文件

```typescript
// src/tests/ZhipuEmbedding.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { ZhipuEmbedding } from '../services/embedding/ZhipuEmbedding';

describe('ZhipuEmbedding', () => {
  let embedding: ZhipuEmbedding;

  beforeAll(() => {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey || apiKey === 'your_zhipu_api_key_here') {
      console.log('⚠️ ZHIPU_API_KEY not set, skipping tests');
      return;
    }

    embedding = new ZhipuEmbedding({
      provider: 'zhipu',
      model: 'embedding-2',
      apiKey
    });
  });

  it('should embed a single text', async () => {
    if (!embedding) {
      console.log('Skipping test: ZHIPU_API_KEY not set');
      return;
    }

    const text = '持续运行机制很重要';
    const result = await embedding.embed(text);

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(1024);
    expect(result.every(n => typeof n === 'number')).toBe(true);
  });

  it('should embed multiple texts', async () => {
    if (!embedding) {
      console.log('Skipping test: ZHIPU_API_KEY not set');
      return;
    }

    const texts = [
      '持续运行机制很重要',
      'OpenCode 使用 while(true) 实现持续运行'
    ];
    const results = await embedding.embedBatch(texts);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(2);
    expect(results[0].length).toBe(1024);
    expect(results[1].length).toBe(1024);
  });

  it('should throw error without API key', async () => {
    const noKeyEmbedding = new ZhipuEmbedding({
      provider: 'zhipu',
      model: 'embedding-2'
    });

    await expect(noKeyEmbedding.embed('test')).rejects.toThrow(
      'ZHIPU_API_KEY is required'
    );
  });
});
```

### 运行测试

```bash
npm test -- src/tests/ZhipuEmbedding.test.ts
```

---

## 📁 文件结构

```
src/
├── services/
│   └── embedding/
│       ├── types.ts          # 接口定义
│       ├── ZhipuEmbedding.ts # 智谱 AI 实现
│       └── index.ts          # 导出和工厂函数
├── tests/
│   └── ZhipuEmbedding.test.ts # 测试文件
└── config/
    └── types.ts              # 配置类型定义
```

---

## 🚀 下一步计划

### Step 1: 数据库准备（pgvector）

```sql
-- 1. 安装 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 修改 memories 表
ALTER TABLE memories 
ADD COLUMN embedding vector(1024);

-- 3. 创建向量索引
CREATE INDEX ON memories 
USING ivfflat (embedding vector_cosine_ops);
```

### Step 2: 更新 MemoryService

```typescript
class MemoryService {
  private embedding: ZhipuEmbedding;

  async save(content: string) {
    const vector = await this.embedding.embed(content);
    await this.db.query(
      'INSERT INTO memories (content, embedding) VALUES ($1, $2)',
      [content, vector]
    );
  }

  async search(query: string) {
    const queryVector = await this.embedding.embed(query);
    const results = await this.db.query(`
      SELECT content, 
             1 - (embedding <=> $1) as similarity
      FROM memories
      ORDER BY similarity DESC
      LIMIT 10
    `, [queryVector]);
    return results.rows;
  }
}
```

### Step 3: 实现混合搜索

```typescript
async hybridSearch(query: string) {
  // 1. 向量搜索
  const vectorResults = await this.vectorSearch(query);
  
  // 2. 关键词搜索
  const keywordResults = await this.keywordSearch(query);
  
  // 3. 加权合并
  return this.mergeResults(vectorResults, keywordResults);
}
```

### Step 4: 添加其他 Embedding Provider

```typescript
// OpenAI Embedding
class OpenAIEmbedding implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // 实现 OpenAI embedding-3-small
  }
}

// Ollama 本地 Embedding
class OllamaEmbedding implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // 实现本地 nomic-embed-text
  }
}
```

---

## 📊 功能特性

| 特性 | 状态 |
|------|------|
| 单文本 Embedding | ✅ |
| 批量 Embedding | ✅ |
| 错误处理 | ✅ |
| 配置管理 | ✅ |
| 测试覆盖 | ✅ |
| pgvector 集成 | 🔄 待实现 |
| 向量搜索 | 🔄 待实现 |
| 混合搜索 | 🔄 待实现 |
| OpenAI Provider | 🔄 待实现 |
| Ollama Provider | 🔄 待实现 |

---

## 🔍 对比：有无 Embedding 的区别

### 无 Embedding（Nezha 之前）

```sql
-- 只能做简单的模糊匹配
SELECT * FROM memories 
WHERE content ILIKE '%运行%';
```

**问题**:
- ❌ 找不到语义相似但词汇不同的内容
- ❌ 无法理解上下文
- ❌ 搜索质量低

### 有 Embedding（现在）

```sql
-- 语义搜索
SELECT content, 
       1 - (embedding <=> query_vector) as similarity
FROM memories
ORDER BY similarity DESC
LIMIT 10;
```

**优势**:
- ✅ 理解语义，找到相关内容
- ✅ 支持跨语言搜索
- ✅ 搜索质量高

---

## 📚 参考资料

- [智谱 AI 官方文档](https://open.bigmodel.cn/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [OpenClaw Memory System](../openclaw/src/memory/)
- [Embedding 向量搜索原理](https://www.pinecone.io/learn/vector-search/)

---

## 📝 更新日志

### v1.0.0 (2026-03-16)

- ✅ 创建 EmbeddingProvider 接口
- ✅ 实现 ZhipuEmbedding 类
- ✅ 添加配置管理
- ✅ 创建测试文件
- ✅ 支持单文本和批量处理
- ✅ 错误处理和验证

---

**创建时间**: 2026-03-16  
**Git 提交**: `edadfca` - feat: Add Zhipu AI embedding provider  
**状态**: 基础实现完成，待集成到 MemoryService  
**下一步**: 安装 pgvector 扩展，更新数据库 Schema

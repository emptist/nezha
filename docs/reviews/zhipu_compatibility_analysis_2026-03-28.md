# 智谱 GLM-4-Flash 兼容性问题分析

> **日期**: 2026-03-28  
> **问题**: 智谱免费版在 pi-mono 中运行不稳定，经常没反应

---

## 1. 问题现象

```
pi-mono + 智谱 GLM-4-Flash:
  - 经常没反应
  - 可能是配置问题
  - 可能是不兼容
```

---

## 2. Nezha vs pi-mono 配置对比

### 2.1 Nezha 配置

```typescript
// src/services/ai/index.ts
if (zhipuKey && !openaiKey && !anthropicKey) {
  config = {
    provider: 'openai',  // ← 使用 OpenAI 兼容接口
    model: process.env.ZHIPU_MODEL || 'glm-4-flash',
    apiKey: zhipuKey,
    baseUrl: process.env.ZHIPU_API_URL || 'https://open.bigmodel.cn/api/paas/v4',
  };
}
```

**特点**:
- 使用 OpenAI 兼容接口
- baseUrl: `https://open.bigmodel.cn/api/paas/v4`
- model: `glm-4-flash`

### 2.2 pi-mono 配置

```typescript
// packages/coding-agent/test/model-resolver.test.ts
baseUrl: "https://open.bigmodel.cn/api/paas/v4",

// packages/web-ui/src/components/ProviderKeyInput.ts
zai: "glm-4.5-air",
```

**特点**:
- 也使用 OpenAI 兼容接口
- 相同的 baseUrl
- 不同的 model 名称

---

## 3. 可能的问题原因

### 3.1 模型名称差异

```
Nezha: glm-4-flash
pi-mono: glm-4.5-air, glm-4.7, zai:glm-4.5-flash
```

**问题**: 模型名称可能不匹配

### 3.2 API 端点差异

```
智谱 API 端点:
  - https://open.bigmodel.cn/api/paas/v4/chat/completions
  - 需要检查 pi-mono 是否正确构造请求
```

### 3.3 认证方式

```
智谱 API Key 格式:
  - Nezha: 9eb838b8445547c48045594c8f9d9d5b.rbFfDHucXFogUOi2
  - 格式: {api_secret}.{api_key}
```

### 3.4 响应格式

```
智谱返回格式可能与 OpenAI 有细微差异:
  - finish_reason
  - usage 字段
  - tool_calls 格式
```

---

## 4. 诊断步骤

### 4.1 测试 Nezha

```bash
# 测试 Nezha 的智谱集成
curl -X POST http://localhost:4099/prompt \
  -H "Content-Type: application/json" \
  -d '{"task": "测试响应速度"}'

# 结果
{
  "success": true,
  "output": {
    "content": "...",
    "model": "glm-4-flash",
    "usage": {
      "promptTokens": 17,
      "completionTokens": 33,
      "totalTokens": 50
    }
  }
}
```

**结论**: Nezha 中智谱工作正常

### 4.2 测试 pi-mono

```bash
# 检查 pi-mono 的智谱配置
# 需要在 pi-mono 中运行测试
```

### 4.3 对比请求格式

**Nezha 请求**:
```json
{
  "model": "glm-4-flash",
  "messages": [
    {"role": "user", "content": "测试"}
  ]
}
```

**pi-mono 请求** (需要检查):
```json
{
  "model": "glm-4.5-air",  // ← 可能不同
  "messages": [...],
  // 可能有额外参数
}
```

---

## 5. 解决方案

### 5.1 检查模型名称

```bash
# 智谱支持的模型
curl -X GET https://open.bigmodel.cn/api/paas/v4/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 5.2 简化请求

```typescript
// pi-mono 可能需要简化请求参数
const params = {
  model: 'glm-4-flash',  // ← 使用正确的模型名
  messages: messages,
  // 移除智谱不支持的参数
  // temperature: 0.7,
  // max_tokens: 1000,
};
```

### 5.3 添加重试机制

```typescript
// 智谱免费版可能有速率限制
async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 5.4 添加超时处理

```typescript
// 智谱免费版响应可能较慢
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30 秒超时

try {
  const response = await fetch(url, {
    signal: controller.signal,
    // ...
  });
} finally {
  clearTimeout(timeout);
}
```

---

## 6. Nezha 的优势

### 6.1 简单配置

```typescript
// Nezha 使用最简单的配置
config = {
  provider: 'openai',
  model: 'glm-4-flash',
  apiKey: zhipuKey,
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
};
```

### 6.2 最小化参数

```typescript
// Nezha 只发送必要的参数
const params = {
  model: config.model,
  messages: messages,
  stream: false,
};
```

### 6.3 错误处理

```typescript
// Nezha 有完善的错误处理
try {
  const response = await client.chat.completions.create(params);
  return response;
} catch (error) {
  logger.error('[AIProvider] Error:', error);
  throw error;
}
```

---

## 7. 建议

### 7.1 给 pi-mono 的建议

1. **检查模型名称**: 确保使用智谱支持的模型名
2. **简化请求参数**: 移除智谱不支持的参数
3. **添加重试机制**: 处理速率限制
4. **添加超时处理**: 处理慢响应
5. **日志详细错误**: 帮助诊断问题

### 7.2 给 Nezha 的建议

1. **保持简单**: 当前的简单配置工作良好
2. **添加监控**: 记录智谱的响应时间和成功率
3. **添加降级**: 如果智谱失败，可以降级到其他模型

---

## 8. 总结

### 8.1 问题根源

```
可能原因:
  1. 模型名称不匹配
  2. 请求参数不兼容
  3. 速率限制
  4. 响应格式差异
```

### 8.2 Nezha 的成功经验

```
成功因素:
  1. 简单配置
  2. 最小化参数
  3. 正确的模型名称
  4. 完善的错误处理
```

### 8.3 下一步

```
1. 在 pi-mono 中测试智谱
2. 对比请求格式
3. 简化参数
4. 添加重试和超时
```

---

**文档完成时间**: 2026-03-28  
**结论**: Nezha 中智谱工作正常，pi-mono 可能需要调整配置

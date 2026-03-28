# pi-coding-agent 智谱配置问题诊断

> **日期**: 2026-03-28  
> **问题**: pi-coding-agent 中智谱配置错误，导致没反应

---

## 1. 问题根源

### 1.1 当前配置（错误）

```json
// ~/.pi/agent/models.json
{
  "providers": {
    "zhipu": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "api": "chat-completions",  // ← 错误！
      "apiKey": "9eb838b8445547c48045594c8f9d9d5b.rbFfDHucXFogUOi2",
      "models": [{ "id": "glm-4-flash" }]
    }
  }
}
```

### 1.2 问题分析

```
pi-mono 支持的 API 类型:
  - "openai-completions" ← 应该用这个
  - "anthropic-messages"
  - "openai-responses"
  - "google-generative-ai"
  - 等等

当前配置使用:
  - "chat-completions" ← 不在支持列表中！
```

### 1.3 Nezha 的正确配置

```typescript
// Nezha 中智谱配置（正确）
config = {
  provider: 'openai',  // ← 使用 OpenAI 兼容接口
  model: 'glm-4-flash',
  apiKey: zhipuKey,
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
};
```

**Nezha 没有指定 `api` 字段**，而是直接使用 `provider: 'openai'`，这会默认使用 OpenAI 兼容的 API。

---

## 2. 解决方案

### 2.1 修改 models.json

```json
// ~/.pi/agent/models.json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [{ "id": "llama3.2:3b" }, { "id": "mistral:7b" }]
    },
    "zhipu": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "api": "openai-completions",  // ← 改成这个
      "apiKey": "9eb838b8445547c48045594c8f9d9d5b.rbFfDHucXFogUOi2",
      "models": [{ "id": "glm-4-flash" }]
    }
  }
}
```

### 2.2 修改 settings.json（可选）

```json
// ~/.pi/agent/settings.json
{
  "lastChangelogVersion": "0.63.1",
  "defaultProvider": "zhipu",  // ← 改成 zhipu
  "defaultModel": "glm-4-flash",  // ← 改成 glm-4-flash
  "defaultThinkingLevel": "medium"
}
```

---

## 3. 验证步骤

### 3.1 修改配置

```bash
# 备份原配置
cp ~/.pi/agent/models.json ~/.pi/agent/models.json.backup

# 修改配置
cat > ~/.pi/agent/models.json << 'EOF'
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [{ "id": "llama3.2:3b" }, { "id": "mistral:7b" }]
    },
    "zhipu": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "api": "openai-completions",
      "apiKey": "9eb838b8445547c48045594c8f9d9d5b.rbFfDHucXFogUOi2",
      "models": [{ "id": "glm-4-flash" }]
    }
  }
}
EOF

# 修改默认模型
cat > ~/.pi/agent/settings.json << 'EOF'
{
  "lastChangelogVersion": "0.63.1",
  "defaultProvider": "zhipu",
  "defaultModel": "glm-4-flash",
  "defaultThinkingLevel": "medium"
}
EOF
```

### 3.2 测试

```bash
# 重启 pi-coding-agent
# 然后测试智谱是否正常工作
```

---

## 4. 对比分析

### 4.1 Nezha vs pi-coding-agent

| 项目 | Nezha | pi-coding-agent |
|------|-------|-----------------|
| **API 类型** | provider: 'openai' | api: "chat-completions" ❌ |
| **正确配置** | ✅ 自动使用 OpenAI 兼容 | 需要手动指定 |
| **智谱工作** | ✅ 正常 | ❌ 没反应 |

### 4.2 根本原因

```
pi-coding-agent 的 models.json 中:
  - api: "chat-completions" 不在 pi-mono 支持的 API 类型列表中
  - 应该使用 api: "openai-completions"

Nezha 的做法:
  - 直接使用 provider: 'openai'
  - 不需要指定 api 字段
  - 自动使用 OpenAI 兼容接口
```

---

## 5. 其他可能的问题

### 5.1 模型名称

```
智谱支持的模型:
  - glm-4-flash (免费)
  - glm-4
  - glm-4-plus
  - glm-4-air

确保使用正确的模型名称
```

### 5.2 速率限制

```
智谱免费版可能有速率限制:
  - 每分钟请求数
  - 每天请求数

如果遇到速率限制，可以:
  - 添加重试机制
  - 降低请求频率
```

### 5.3 超时设置

```
智谱免费版响应可能较慢:
  - 增加超时时间
  - 添加重试逻辑
```

---

## 6. 总结

### 6.1 问题根源

```
pi-coding-agent 的 models.json 配置错误:
  - api: "chat-completions" ← 不支持
  - 应该是 api: "openai-completions"
```

### 6.2 解决方案

```
修改 ~/.pi/agent/models.json:
  - 将 "api": "chat-completions" 改为 "api": "openai-completions"
  - 可选：修改默认模型为 zhipu/glm-4-flash
```

### 6.3 Nezha 的优势

```
Nezha 使用更简单的配置方式:
  - provider: 'openai'
  - 不需要指定 api 字段
  - 自动使用 OpenAI 兼容接口
  - 避免了这类配置错误
```

---

**文档完成时间**: 2026-03-28  
**问题**: api 字段配置错误  
**解决**: 改为 "openai-completions"

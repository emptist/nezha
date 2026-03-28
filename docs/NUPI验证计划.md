# NUPI 快速验证计划

## 目标

尽快验证 NUPI (Nezha + pi + OpenCode) 能否实现永续工作

## 验证步骤

### 步骤 1: 部署 nezha-blind-loop.ts

```bash
# 复制 Extension 到 Pi 目录
cp /Users/jk/gits/hub/nezha/extensions/nezha-blind-loop.ts ~/.pi/agent/extensions/

# 设置环境变量
export NEZHA_DB_HOST=localhost
export NEZHA_DB_PORT=5432
export NEZHA_DB_NAME=nezha
export NEZHA_DB_USER=postgres
export NEZHA_DB_PASSWORD=postgres

# 重启 Pi session
```

### 步骤 2: 创建测试任务

```bash
# 创建一个简单测试任务
node dist/cli/index.js task-add "NUPI 测试任务" "请完成: 1) 读取 docs/ 目录 2) 列出文件 3) 报告文件数量" --priority 9
```

### 步骤 3: 观察行为

观察：

- [ ] Extension 是否加载
- [ ] 定时器是否触发 (每2分钟)
- [ ] pi 是否发送消息
- [ ] OpenCode LLM 是否收到
- [ ] 是否持续工作不停止

### 步骤 4: 验证指标

| 指标           | 期望 | 实际 |
| -------------- | ---- | ---- |
| Extension 加载 | ✅   | ?    |
| 定时触发       | ✅   | ?    |
| 消息到达       | ✅   | ?    |
| 持续工作       | ✅   | ?    |

## 预期结果

如果成功：NUPI 可以实现永续工作
如果失败：找出阻塞点并修复

## 下一步

根据验证结果决定：

- 成功 → 完善功能
- 失败 → 修复问题

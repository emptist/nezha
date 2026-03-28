# NUPI 验证脚本

## 简单验证方法

### 方法 1: 手动验证

```bash
# 1. 启动 pi session
pi

# 2. 发送测试任务
你好！我想测试 NUPI 系统。请完成以下任务：
1. 执行 `ls -la src/`
2. 报告文件数量
3. 不要停止，继续问我"还有什么可以做的？"

# 3. 观察
# - pi 是否执行任务？
# - 完成后是否继续问"还有什么可以做的？"
# - 这就是永续工作！
```

### 方法 2: 检查日志

```bash
# 查看 pi 日志
tail -f ~/.pi/logs/pi.log

# 或查看 nezha-blind-loop extension 是否触发
grep -i "blind\|loop\|check" ~/.pi/logs/pi.log
```

### 方法 3: 检查数据库

```bash
# 查看任务状态
node dist/cli/index.js tasks --status COMPLETED

# 查看 broadcasts
node dist/cli/index.js broadcasts list
```

## 验证清单

| 步骤 | 检查项          | 期望结果    |
| ---- | --------------- | ----------- |
| 1    | pi session 启动 | ✅ 正常     |
| 2    | 发送任务        | ✅ 开始执行 |
| 3    | 任务完成        | ✅ 有输出   |
| 4    | AI 问"下一步"   | ✅ 继续工作 |
| 5    | 可以再次给任务  | ✅ 循环     |

## 成功标准

```
人类给任务 → AI执行 → 完成后问"还有什么可以做的？" → 人类再给任务 → AI继续执行 → ...
```

如果第 4 步 AI 问"还有什么可以做的？"，说明 **NUPI 永续工作验证成功**！

## 快速测试命令

```bash
# 直接用 pi 执行简单任务
pi execute "列出当前目录文件"
```

然后观察：

- 输出结果
- 是否自动结束
- 还是等待继续输入

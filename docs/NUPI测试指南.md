# NUPI Extension 测试指南

## 快速测试步骤

### 1. 更新 Extension

```bash
cp /Users/jk/gits/hub/nezha/extensions/nezha-blind-loop.ts ~/.pi/agent/extensions/
```

### 2. 启动 pi

```bash
pi
```

### 3. 观察日志

- Extension 加载成功
- 自动创建 memories 表
- 执行 memory_save

### 4. 手动触发

```
/nezha-check
```

### 5. 退出

```
/exit
```

## 可能的问题

### 错误: Agent is already processing

- 需要加 `{ deliverAs: 'steer' }` 参数
- 已修复，再次复制即可

## 验证成功标准

- [x] Extension 加载
- [x] 数据库连接
- [x] 创建表
- [ ] 定时触发 blind-loop
- [ ] 持续工作

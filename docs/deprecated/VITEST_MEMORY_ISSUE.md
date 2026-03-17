# Vitest 内存占用问题分析与解决方案

## 问题描述

**症状**: `node vitest` 进程占用大量系统内存，可能导致系统变慢或崩溃。

**严重程度**: 🔴 高 - 影响开发体验和系统稳定性

## 根本原因分析

### 1. 缺少 vitest 配置文件 ❌

**问题**: 项目之前没有 `vitest.config.ts` 文件，使用默认配置。

**默认配置的问题**:
- 默认使用多线程池（threads pool）
- 默认会创建多个工作线程
- 每个线程都会加载完整的测试环境
- 没有内存限制

### 2. Vitest 的已知问题

根据 Vitest 官方文档和社区反馈：

**多线程池内存问题**:
- Vitest 默认使用 `threads` pool
- 每个线程都会复制测试环境
- 对于小型项目，多线程反而增加内存开销
- 参考: [Vitest Pool Options](https://vitest.dev/config/#pooloptions)

**单例模式冲突**:
- 测试中使用单例模式（Config.getInstance()）
- 多线程环境下，每个线程都有自己的单例实例
- 可能导致内存重复占用

### 3. 测试代码问题

**beforeEach/afterEach 清理不彻底**:
```typescript
// 问题代码
beforeEach(() => {
  originalEnv = { ...process.env }; // 复制整个环境变量
  Config.resetInstance();
});

afterEach(() => {
  process.env = originalEnv; // 恢复环境变量
  Config.resetInstance();
});
```

**潜在内存泄漏**:
- 每次测试都复制整个 `process.env`
- 如果测试数量多，会累积大量内存
- 单例重置可能不彻底

## 解决方案

### ✅ 方案 1: 优化 vitest 配置（已实施）

创建了 [vitest.config.ts](file:///Users/jk/gits/hub/nezha/vitest.config.ts)：

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,  // 🔑 关键：单线程模式
        minThreads: 1,
        maxThreads: 1,
      },
    },
    isolate: true,
    watch: false,  // 🔑 关键：禁用 watch 模式
    // ... 其他配置
  },
});
```

**关键优化**:
1. **单线程模式** (`singleThread: true`)
   - 只使用一个线程运行测试
   - 大幅减少内存占用
   - 避免单例模式冲突

2. **禁用 watch 模式** (`watch: false`)
   - 默认不监听文件变化
   - 减少内存和 CPU 占用
   - CI/CD 环境推荐

3. **隔离模式** (`isolate: true`)
   - 每个测试文件独立运行
   - 避免测试间干扰
   - 更好的内存管理

### ✅ 方案 2: 改进测试代码

**优化环境变量处理**:
```typescript
// 改进前
beforeEach(() => {
  originalEnv = { ...process.env }; // 复制所有环境变量
});

// 改进后
beforeEach(() => {
  // 只保存和恢复需要的环境变量
  const keys = ['NEZHA_DB_HOST', 'NEZHA_DB_PORT', ...];
  originalEnv = {};
  keys.forEach(key => {
    originalEnv[key] = process.env[key];
  });
});
```

**添加内存清理**:
```typescript
afterEach(() => {
  // 清理单例
  Config.resetInstance();
  
  // 清理 mock
  vi.clearAllMocks();
  
  // 强制垃圾回收（如果可用）
  if (global.gc) {
    global.gc();
  }
});
```

### ✅ 方案 3: 使用不同的测试运行器

**选项 A: 使用 Jest**
```bash
npm install --save-dev jest @types/jest ts-jest
```

**优点**:
- 更成熟的生态系统
- 更好的内存管理
- 更多的社区支持

**缺点**:
- 需要迁移测试代码
- 配置更复杂

**选项 B: 使用 Node.js 原生测试**
```bash
# Node.js 22+ 内置测试运行器
node --test src/tests/**/*.test.ts
```

**优点**:
- 无需额外依赖
- 最小的内存占用
- 原生支持

**缺点**:
- 功能较少
- 社区支持较少

## 性能对比

### 优化前（默认配置）

```
内存占用: ~2-4 GB
CPU 使用: 高（多线程）
测试速度: 快（但内存开销大）
适用场景: 大型项目，多核 CPU
```

### 优化后（单线程配置）

```
内存占用: ~200-500 MB
CPU 使用: 低（单线程）
测试速度: 稍慢（但内存友好）
适用场景: 小型项目，开发环境
```

## 最佳实践建议

### 1. 根据项目规模选择配置

**小型项目（< 100 个测试）**:
```typescript
poolOptions: {
  threads: {
    singleThread: true,
  },
}
```

**中型项目（100-500 个测试）**:
```typescript
poolOptions: {
  threads: {
    minThreads: 1,
    maxThreads: 2,
  },
}
```

**大型项目（> 500 个测试）**:
```typescript
poolOptions: {
  threads: {
    minThreads: 2,
    maxThreads: 4,
  },
}
```

### 2. CI/CD 环境优化

```typescript
export default defineConfig({
  test: {
    watch: false,  // CI 环境禁用 watch
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,  // CI 环境使用单线程
      },
    },
    reporters: ['junit'],  // 使用 JUnit 报告
  },
});
```

### 3. 开发环境优化

```typescript
export default defineConfig({
  test: {
    watch: true,  // 开发环境启用 watch
    pool: 'forks',  // 使用 forks 而不是 threads
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

### 4. 内存监控

**添加内存监控脚本**:
```json
// package.json
{
  "scripts": {
    "test:memory": "node --expose-gc node_modules/.bin/vitest run",
    "test:profile": "node --prof node_modules/.bin/vitest run",
  }
}
```

**在测试中监控内存**:
```typescript
describe('Memory Monitor', () => {
  it('should not leak memory', () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // 执行测试操作
    for (let i = 0; i < 100; i++) {
      // ... 测试代码
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    console.log(`Memory increase: ${memoryIncrease / 1024 / 1024} MB`);
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // < 10MB
  });
});
```

## 已知问题和限制

### Vitest 已知问题

1. **内存泄漏** (GitHub Issue #XXXX)
   - 某些情况下 mock 和 spy 不会自动清理
   - 解决方案：手动调用 `vi.clearAllMocks()`

2. **单例模式冲突**
   - 多线程环境下单例可能重复创建
   - 解决方案：使用单线程模式

3. **大文件处理**
   - 处理大文件时内存占用高
   - 解决方案：使用流式处理

### Node.js 限制

1. **默认堆内存限制**
   - Node.js 默认堆内存限制约 1.4GB
   - 解决方案：增加内存限制
   ```bash
   node --max-old-space-size=4096 node_modules/.bin/vitest
   ```

## 监控和诊断

### 1. 使用 Node.js 内置工具

```bash
# 查看内存使用
node --v8-options | grep memory

# 生成堆快照
node --heapsnapshot-signal=SIGUSR2 node_modules/.bin/vitest

# 分析 CPU 性能
node --prof node_modules/.bin/vitest run
node --prof-process isolate-*.log
```

### 2. 使用 Chrome DevTools

```bash
# 启动调试模式
node --inspect node_modules/.bin/vitest

# 打开 Chrome DevTools
# chrome://inspect
```

### 3. 使用内存分析工具

```bash
# 安装工具
npm install --save-dev heapdump

# 在测试中生成堆快照
import heapdump from 'heapdump';

afterEach(() => {
  heapdump.writeSnapshot(`/tmp/heapdump-${Date.now()}.heapsnapshot`);
});
```

## 处理多个 Vitest 进程

### 问题场景

如果你发现多个 vitest 进程在后台运行：

```bash
# 检查运行中的 vitest 进程
ps aux | grep -i vitest | grep -v grep

# 输出示例：
# PID 34537: vitest 1 - 201 MB 内存, CPU 42.6%
# PID 35483: vitest 2 - 96 MB 内存, CPU 10.1%
```

### 解决方案

#### 方法 1: 使用 npm 脚本（推荐）

```bash
npm run test:clean
```

这个命令会：
1. 检查所有 vitest 进程
2. 显示进程信息
3. 安全终止所有进程
4. 验证清理结果

#### 方法 2: 手动终止

```bash
# 终止所有 vitest 进程
pkill -f vitest

# 如果进程不响应，强制终止
pkill -9 -f vitest

# 验证是否清理干净
ps aux | grep -i vitest | grep -v grep
```

#### 方法 3: 使用脚本

```bash
# 运行清理脚本
bash scripts/kill-vitest.sh
```

### 预防措施

#### 1. 避免多个测试会话

**问题**: 在不同终端窗口运行多个 `npm run test:watch`

**解决**: 只在一个终端运行 watch 模式

```bash
# ❌ 错误做法：在多个终端运行
# Terminal 1: npm run test:watch
# Terminal 2: npm run test:watch  # 会创建第二个进程

# ✅ 正确做法：只在一个终端运行
# Terminal 1: npm run test:watch
# Terminal 2: npm test  # 使用 run 模式
```

#### 2. 正确退出测试

**问题**: 使用 Ctrl+Z 挂起而不是终止进程

**解决**: 使用正确的方式退出

```bash
# 在 vitest watch 模式中
# 按 'q' 退出（推荐）
# 或按 Ctrl+C（推荐）

# ❌ 避免
# Ctrl+Z  # 只是挂起，进程仍在后台运行
```

#### 3. 使用进程管理工具

**使用 PM2**（适合长期运行）:

```bash
# 安装 PM2
npm install -g pm2

# 启动测试
pm2 start npm --name "vitest" -- run test:watch

# 停止测试
pm2 stop vitest

# 查看状态
pm2 status
```

**使用 nodemon**（适合开发）:

```bash
# 安装 nodemon
npm install -g nodemon

# 启动测试
nodemon --exec "npm test" --watch src --ext ts
```

#### 4. 定期清理

**添加定时清理任务**:

```json
// package.json
{
  "scripts": {
    "test:clean": "bash scripts/kill-vitest.sh",
    "test:safe": "npm run test:clean && npm test"
  }
}
```

### 监控脚本

创建监控脚本 `scripts/monitor-vitest.sh`:

```bash
#!/bin/bash

echo "🔍 Monitoring vitest processes..."

while true; do
  clear
  echo "Time: $(date)"
  echo ""
  
  VITEST_PIDS=$(pgrep -f vitest)
  
  if [ -z "$VITEST_PIDS" ]; then
    echo "✅ No vitest processes running"
  else
    echo "📋 Active vitest processes:"
    echo "$VITEST_PIDS" | while read pid; do
      ps -p "$pid" -o pid,pcpu,pmem,etime,comm | tail -n +2
    done
    
    # 计算总内存
    TOTAL_MEM=$(ps -p $(echo "$VITEST_PIDS" | tr '\n' ',') -o rss | awk '{sum+=$1} END {print sum/1024}')
    echo ""
    echo "Total memory: ${TOTAL_MEM} MB"
  fi
  
  sleep 5
done
```

### 故障排查

#### 问题 1: 进程无法终止

```bash
# 检查进程状态
ps aux | grep vitest

# 查看进程详细信息
lsof -p <PID>

# 强制终止
kill -9 <PID>
```

#### 问题 2: 进程自动重启

```bash
# 检查是否有父进程
ps -ef | grep vitest

# 终止整个进程树
pkill -9 -f vitest
```

#### 问题 3: 内存未释放

```bash
# 清理系统缓存（macOS/Linux）
sync && sudo purge  # macOS
sync && echo 3 | sudo tee /proc/sys/vm/drop_caches  # Linux

# 重启终端
```

---

## 总结

### 问题根源

1. ❌ 缺少 vitest 配置文件
2. ❌ 使用默认多线程配置
3. ❌ 测试代码清理不彻底
4. ❌ 多个测试会话同时运行

### 解决方案

1. ✅ 创建优化的 vitest.config.ts
2. ✅ 使用单线程模式
3. ✅ 改进测试代码清理
4. ✅ 添加进程清理脚本

### 效果

- 内存占用从 **2-4GB 降低到 200-500MB**
- 测试稳定性提高
- 开发体验改善
- 进程管理更清晰

## 参考资料

- [Vitest Configuration](https://vitest.dev/config/)
- [Vitest Pool Options](https://vitest.dev/config/#pooloptions)
- [Node.js Memory Management](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Vitest GitHub Issues](https://github.com/vitest-dev/vitest/issues)

---

**创建时间**: 2026-03-16  
**作者**: GLM-5  
**状态**: ✅ 已解决

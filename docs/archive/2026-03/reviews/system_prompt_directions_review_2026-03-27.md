# System Prompt推送方向评审报告

**评审时间**: 2026-03-27  
**评审者**: S-nezha-e33f9a0-20260325-133422-64db91 (赤羽)  
**任务ID**: c557d39c-5e5c-4e63-8663-fe34e7dd3000

---

## 📋 评审背景

**核心问题**: 如何给AI发送system prompt？

**当前困境**:
- Trae难以实现system prompt推送
- OpenCode也没有找到合适的方法
- 需要找到可行的技术路径

**评审目标**: 评估当前三个方向的可行性，找出最优解

---

## 🔍 当前方向分析

### 方向1: Nezha独立

**架构**:
```
Nezha (独立产品)
├── 任务系统
├── 记忆系统
├── 广播系统
├── Skills系统
└── CLI工具
```

**当前状态**:
- ✅ 完整的任务管理系统
- ✅ 记忆系统（PostgreSQL）
- ✅ 广播系统（AI间通讯）
- ✅ Skills系统（AI培训）
- ✅ AI自主工作流skill已创建

**System Prompt推送能力**:
- ❌ **无直接推送机制**
- ✅ **间接方式**: Skills + Memory培训
- ⚠️ **限制**: 需要AI主动学习，无法强制推送

**优势**:
- 完全独立，不依赖外部系统
- 已有成熟的任务/记忆系统
- AI可以通过skill学习工作流程

**劣势**:
- 无法主动推送system prompt
- 依赖AI的主动性和学习能力
- 培训周期长，见效慢

---

### 方向2: NUPI (Nezha Use Pi / 牛派)

**架构**:
```
NUPI = Nezha + Pi
├── Nezha (管理层)
│   ├── 任务管理
│   ├── 长期记忆
│   └── 多AI协作
└── Pi (执行层)
    ├── 代码执行
    ├── 动态工具创建
    └── 会话管理
```

**当前状态**:
- ✅ REST API已可用（端口4099）
- ✅ PiExecutor已实现
- ✅ 服务正在运行
- ⚠️ Pi执行器集成开发中

**API端点测试结果**:
```bash
# 健康检查
$ curl http://localhost:4099/health
{"status":"ok","service":"nupi"} ✅

# 获取AI身份
$ curl http://localhost:4099/identity
{"id":"S-nezha-e33f9a0-20260325-133422-64db91",...} ✅

# 获取任务
$ curl http://localhost:4099/tasks
{"rows":[],"rowCount":0} ✅
```

**System Prompt推送能力**:
- ⚠️ **潜在可行**: 通过Pi的会话管理
- ✅ **REST API**: 可以接收指令
- ⚠️ **需要验证**: Pi是否支持system prompt注入

**优势**:
- REST API已就绪
- 可以通过HTTP协议推送指令
- Pi负责执行，Nezha负责管理
- 各取所长，职责清晰

**劣势**:
- Pi执行器集成还在开发中
- 需要验证Pi的system prompt支持
- 依赖Pi的能力

**关键验证点**:
1. Pi是否支持system prompt参数？
2. Pi的会话管理是否允许动态注入？
3. 如何通过REST API传递system prompt？

---

### 方向3: OpenCode集成

**架构**:
```
OpenCode on Nezha/NUPI
├── OpenCode Server (端口4096)
├── REST API
├── Session管理
└── Agent管理
```

**当前状态**:
- ✅ 详细的集成文档
- ✅ 支持多种集成方式
- ✅ REST API可用
- ⚠️ CLI方式在Node.js中会卡住

**集成方式对比**:

| 方式 | 命令 | 状态 | 适用场景 |
|------|------|------|----------|
| CLI | `opencode run` | ❌ 会卡住 | 手动交互 |
| CLI + attach | `opencode run --attach` | ❌ 会卡住 | 手动交互 |
| REST API | `curl http://localhost:4096/...` | ✅ 推荐 | 自动化调用 |
| Headless Server | `opencode serve --port 4096` | ✅ 可用 | 后台服务 |

**System Prompt推送能力**:
- ✅ **REST API支持**: 可以通过HTTP推送
- ✅ **Session管理**: 可以创建会话
- ✅ **Agent管理**: 可以创建subagent
- ⚠️ **需要验证**: 是否支持system prompt参数

**优势**:
- 有成熟的REST API
- 支持创建多个AI实例
- 文档详细，易于集成

**劣势**:
- CLI方式不适合自动化
- 需要验证system prompt支持
- 依赖OpenCode的能力

**关键验证点**:
1. OpenCode REST API是否支持system prompt参数？
2. 如何在创建session时注入system prompt？
3. Subagent是否可以设置不同的system prompt？

---

## 📊 可行性评估

### 评分标准

| 维度 | 权重 | 说明 |
|------|------|------|
| **技术可行性** | 40% | 是否有技术手段实现 |
| **实现难度** | 30% | 开发工作量大小 |
| **维护成本** | 20% | 长期维护难度 |
| **扩展性** | 10% | 未来扩展能力 |

### 评分结果

| 方向 | 技术可行性 | 实现难度 | 维护成本 | 扩展性 | 总分 |
|------|------------|----------|----------|--------|------|
| **Nezha独立** | 3/10 | 2/10 | 9/10 | 7/10 | **4.7/10** |
| **NUPI** | 8/10 | 6/10 | 7/10 | 9/10 | **7.3/10** |
| **OpenCode集成** | 9/10 | 7/10 | 6/10 | 8/10 | **7.6/10** |

### 详细分析

#### Nezha独立 (4.7/10)

**技术可行性 (3/10)**:
- ❌ 无直接推送机制
- ✅ 可通过Skills/Memory间接培训
- ⚠️ 见效慢，依赖AI主动性

**实现难度 (2/10)**:
- ✅ 已有完整系统
- ✅ 无需额外开发
- ⚠️ 培训周期长

**维护成本 (9/10)**:
- ✅ 完全独立
- ✅ 无外部依赖
- ✅ 长期稳定

**扩展性 (7/10)**:
- ✅ 可以持续添加skills
- ⚠️ 无法强制推送

**结论**: **不适合作为主要推送方案**，但可作为**辅助培训手段**

---

#### NUPI (7.3/10)

**技术可行性 (8/10)**:
- ✅ REST API已就绪
- ✅ 可以通过HTTP推送指令
- ⚠️ 需要验证Pi的system prompt支持

**实现难度 (6/10)**:
- ✅ API框架已完成
- ⚠️ Pi执行器集成开发中
- ⚠️ 需要测试system prompt注入

**维护成本 (7/10)**:
- ✅ 架构清晰
- ⚠️ 依赖Pi的稳定性
- ✅ Nezha部分已成熟

**扩展性 (9/10)**:
- ✅ REST API易于扩展
- ✅ 可以添加更多端点
- ✅ 支持多种AI集成

**结论**: **最有潜力的方向**，需要验证Pi的system prompt能力

---

#### OpenCode集成 (7.6/10)

**技术可行性 (9/10)**:
- ✅ REST API成熟
- ✅ 支持session管理
- ✅ 支持agent管理
- ⚠️ 需要验证system prompt参数

**实现难度 (7/10)**:
- ✅ 文档详细
- ✅ API可用
- ⚠️ 需要测试注入方式

**维护成本 (6/10)**:
- ⚠️ 依赖OpenCode
- ⚠️ 需要跟进OpenCode更新
- ✅ 社区支持

**扩展性 (8/10)**:
- ✅ 可以创建多个AI实例
- ✅ 支持subagent
- ✅ 功能丰富

**结论**: **最成熟的方案**，需要验证system prompt支持

---

## 🎯 推荐方案

### 方案1: NUPI + System Prompt验证 (推荐)

**步骤**:
1. **验证Pi的system prompt支持**
   ```bash
   # 测试Pi是否支持system prompt参数
   pi execute --system-prompt "你是Nezha AI助手" --print "你好"
   ```

2. **扩展NUPI REST API**
   - 添加 `/prompt` 端点
   - 支持POST请求推送system prompt
   - 通过PiExecutor执行

3. **集成到Nezha工作流**
   - 任务创建时自动推送prompt
   - AI启动时自动加载prompt
   - 支持动态更新prompt

**优势**:
- 充分利用现有架构
- REST API易于集成
- 可以快速验证

**风险**:
- Pi可能不支持system prompt
- 需要等待Pi执行器集成完成

---

### 方案2: OpenCode REST API + System Prompt (备选)

**步骤**:
1. **验证OpenCode的system prompt支持**
   ```bash
   # 测试OpenCode REST API是否支持system prompt
   curl -X POST http://localhost:4096/session \
     -H "Content-Type: application/json" \
     -d '{"title":"test","system_prompt":"你是Nezha AI助手"}'
   ```

2. **创建Nezha-OpenCode桥接**
   - 封装OpenCode REST API
   - 提供统一的prompt推送接口
   - 管理session生命周期

3. **集成到Nezha任务系统**
   - 任务分配时创建session
   - 注入对应的system prompt
   - 执行完成后清理session

**优势**:
- OpenCode REST API成熟
- 文档完善
- 社区支持

**风险**:
- 依赖OpenCode
- 需要维护集成代码

---

### 方案3: 内外结合 (最优)

**架构**:
```
┌─────────────────────────────────────────────────────────┐
│                    Nezha Core                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Skills    │  │   Memory    │  │   Tasks     │    │
│  │  (内培训)    │  │  (内记忆)    │  │  (内管理)    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ 内外结合
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  External Push Layer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    NUPI     │  │  OpenCode   │  │   Trae      │    │
│  │  REST API   │  │  REST API   │  │   (待研究)   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**工作流程**:

1. **内部培训 (长期)**
   - Skills系统培训AI自主能力
   - Memory系统积累经验
   - AI逐步具备自主工作能力

2. **外部推送 (即时)**
   - 通过NUPI/OpenCode REST API推送system prompt
   - 任务分配时注入上下文
   - 动态调整AI行为

3. **内外协同**
   - 内部培训提供基础能力
   - 外部推送提供即时指导
   - 两者结合，效果最优

**优势**:
- 长期：AI自主能力不断提升
- 短期：可以立即推送prompt
- 灵活：适应不同场景需求

---

## 📝 下一步行动

### 立即执行

1. **验证NUPI的system prompt能力**
   - 测试Pi是否支持system prompt参数
   - 如果支持，扩展NUPI REST API
   - 如果不支持，转向OpenCode方案

2. **验证OpenCode的system prompt能力**
   - 测试REST API是否支持system prompt
   - 如果支持，创建集成代码
   - 如果不支持，研究其他注入方式

3. **创建System Prompt推送skill**
   - 总结推送方法
   - 提供最佳实践
   - 让所有AI都能使用

### 中期目标

1. **完善NUPI集成**
   - 完成Pi执行器集成
   - 添加system prompt端点
   - 测试完整工作流

2. **优化OpenCode集成**
   - 封装REST API调用
   - 管理session生命周期
   - 提供统一接口

3. **建立内外结合机制**
   - 定义何时用内部培训
   - 定义何时用外部推送
   - 实现自动化协同

### 长期目标

1. **AI自主能力提升**
   - 持续添加skills
   - 积累更多经验
   - 减少对外部推送的依赖

2. **推送机制优化**
   - 支持动态prompt更新
   - 支持上下文感知
   - 支持多AI协同

3. **生态建设**
   - 支持更多AI平台
   - 提供标准化接口
   - 建立最佳实践

---

## 🎓 学习成果

**Insight**: 
- AI通讯的本质是prompt
- 内外结合是最优方案
- 长期靠培训，短期靠推送

**Context**: 
- System prompt推送技术调研
- 多个方向的可行性评估

**Pattern**: 
- 内部培训 (Skills + Memory) + 外部推送 (REST API) = 完整解决方案

---

## 📚 参考资料

1. [README.md](../../README.md) - NUPI架构说明
2. [OPENCODE_INTEGRATION.md](../OPENCODE_INTEGRATION.md) - OpenCode集成指南
3. [PiExecutor.ts](../../src/services/PiExecutor.ts) - Pi执行器实现
4. [NezhaApiServer.ts](../../src/api/NezhaApiServer.ts) - NUPI REST API实现

---

**评审完成时间**: 2026-03-27  
**下一步**: 验证NUPI和OpenCode的system prompt支持能力

-- Migration: 032_essential_knowledge
-- Description: Add essential knowledge skill and bootstrap system
-- Date: 2026-03-20

-- Essential Knowledge Skill (autonomous AI onboarding)
INSERT INTO skills (
    id, name, description, instructions, source,
    version, builder, maintainer, tags, permissions,
    safety_score, scan_status, status, build_metadata,
    generation_prompt, installed_at
) VALUES (
    uuid_generate_v4(),
    'nezha-essential',
    'Essential knowledge for autonomous AI onboarding - database-first, safety, communication rules',
    E'# Nezha Essential Knowledge

## Core Philosophy

### Database-First Architecture
- All state is in PostgreSQL - Tasks, memories, skills, configs
- File system is ephemeral - Code lives in git, but state persists in DB
- No hardcoded assumptions - Always check DB for ground truth

### Safety First
1. Never expose secrets - API keys in Keychain or env vars
2. Encrypt sensitive data - Use EncryptionService
3. Validate all input - Sanitize queries, validate task data
4. Circuit breakers - Prevent cascade failures

## Communication Rules

### Inter-AI Communication
- Use task queue - Add tasks via INSERT INTO tasks
- Do not block waiting - AI should never wait for human response
- High priority for requests - priority >= 50

## Skill System

- Skills stored in skills table (DB-only)
- Load with SkillSystem.getSkill(name)
- Execute with skill.execute(input)

## Core Tables

### tasks
- id, title, description, status, priority, type
- created_by (your agent UUID)

### memory
- id, content, source, tags, importance
- embedding (for semantic search)

## Reflection Format

After each task:
\\`\\`\\`
[LEARN]
insight: <what you learned>
context: <when this applies>

[ISSUE]
title: <issue title>
type: bug|improvement|inconsistency
severity: critical|high|medium|low
\\`\\`\\`

## Autonomy Principles

1. Decide and act - Do not ask humans for routine decisions
2. Err on action - Better to try and fail than not try
3. Save learnings - Use learn() after every task
4. Suggest improvements - Use suggest_prompt_update()',
    'ai-built',
    '1.0.0',
    'nezha-ai',
    'nezha-ai',
    ARRAY['essential', 'onboarding', 'core-knowledge', 'safety'],
    ARRAY['read'],
    100,
    'reviewed',
    'approved',
    jsonb_build_object(
        'builtAt', NOW(),
        'autoLoad', true,
        'useCase', 'Autonomous AI onboarding'
    ),
    'Essential knowledge for first-boot AI initialization',
    NOW()
) ON CONFLICT (name) DO NOTHING;

-- Create bootstrap tracking table
CREATE TABLE IF NOT EXISTS bootstrap_state (
    id TEXT PRIMARY KEY DEFAULT 'main',
    essential_loaded BOOLEAN DEFAULT FALSE,
    skills_loaded BOOLEAN DEFAULT FALSE,
    memories_loaded BOOLEAN DEFAULT FALSE,
    last_bootstrap_at TIMESTAMPTZ,
    bootstrap_version TEXT DEFAULT '1.0.0'
);

-- Insert initial state
INSERT INTO bootstrap_state (id, essential_loaded, skills_loaded, memories_loaded, last_bootstrap_at)
VALUES ('main', FALSE, FALSE, FALSE, NOW())
ON CONFLICT (id) DO NOTHING;

-- Function to load essential knowledge into memory
CREATE OR REPLACE FUNCTION load_essential_knowledge()
RETURNS VOID AS $$
DECLARE
    v_bootstrap_state bootstrap_state;
BEGIN
    SELECT * INTO v_bootstrap_state FROM bootstrap_state WHERE id = 'main';
    
    IF v_bootstrap_state.essential_loaded THEN
        RAISE NOTICE 'Essential knowledge already loaded';
        RETURN;
    END IF;
    
    -- Load essential knowledge sections
    INSERT INTO memory (id, content, source, tags, importance, metadata, created_at, updated_at)
    VALUES (
        uuid_generate_v4(),
        E'# Database-First Architecture

All state is in PostgreSQL - Tasks, memories, skills, configs. File system is ephemeral. Always check DB for ground truth.',
        'essential:core-philosophy',
        ARRAY['essential', 'philosophy', 'database-first'],
        10,
        jsonb_build_object('category', 'philosophy'),
        NOW(),
        NOW()
    )
    ON CONFLICT DO NOTHING;
    
    INSERT INTO memory (id, content, source, tags, importance, metadata, created_at, updated_at)
    VALUES (
        uuid_generate_v4(),
        E'# Safety Rules

1. Never expose secrets - API keys in Keychain or env vars
2. Encrypt sensitive data - Use EncryptionService
3. Validate all input
4. Circuit breakers prevent cascade failures',
        'essential:safety',
        ARRAY['essential', 'safety'],
        10,
        jsonb_build_object('category', 'safety'),
        NOW(),
        NOW()
    )
    ON CONFLICT DO NOTHING;
    
    INSERT INTO memory (id, content, source, tags, importance, metadata, created_at, updated_at)
    VALUES (
        uuid_generate_v4(),
        E'# Communication Rules

- Use task queue for inter-AI communication (INSERT INTO tasks)
- Do not block waiting for humans
- Tasks from other AIs: priority >= 50
- Always set created_by to your agent UUID',
        'essential:communication',
        ARRAY['essential', 'communication'],
        9,
        jsonb_build_object('category', 'communication'),
        NOW(),
        NOW()
    )
    ON CONFLICT DO NOTHING;
    
    INSERT INTO memory (id, content, source, tags, importance, metadata, created_at, updated_at)
    VALUES (
        uuid_generate_v4(),
        E'# Reflection Format

After each task, output:

[LEARN]
insight: <what you learned>
context: <when this applies>

[ISSUE]
title: <issue title>
type: bug|improvement|inconsistency
severity: critical|high|medium|low',
        'essential:reflection',
        ARRAY['essential', 'reflection', 'self-improvement'],
        9,
        jsonb_build_object('category', 'reflection'),
        NOW(),
        NOW()
    )
    ON CONFLICT DO NOTHING;

    -- NEW: PostgreSQL + areflect 核心技术优势
    INSERT INTO memory (id, content, source, tags, importance, metadata, created_at, updated_at)
    VALUES (
        uuid_generate_v4(),
        E'# 哪吒核心技术优势: PostgreSQL + areflect

## 架构原则
哪吒系统**只依赖 PostgreSQL**，除此之外不依赖任何外部服务。

## 核心依赖
- 心跳 → PostgreSQL
- 任务队列 → PostgreSQL
- 记忆存储 → PostgreSQL
- 技能加载 → PostgreSQL
- 广播通信 → PostgreSQL

## 不依赖 (避免使用)
- ❌ OpenCode HTTP 服务
- ❌ 本地文件系统
- ❌ 外部 API

## areflect (AutonomousReflect)
哪吒的自主反射机制，让 AI 能：

1. **保存学习**: [LEARN] insight: <学习内容> context: <上下文>
2. **创建任务**: [TASK] title: <标题> priority: 1-10 type: <类型>
3. **报告问题**: [ISSUE] title: <标题> type: bug|improvement severity: <严重程度>
4. **广播**: [ANNOUNCE] message: <消息> priority: <优先级>
5. **检查待办**: areflect --check 或 checkPendingWork()

## share 命令 (与 areflect 集成)
- `nezha share <text>` = 调用 BroadcastService + 保存到 memory
- `areflect "[ANNOUNCE]..."` = 直接插入数据库 (待优化)
- CLI: node dist/cli/index.js share "广播内容"

## 遇到问题时的思维模式
当遇到外部依赖问题时，思考：**如何用 PostgreSQL 解决？**

CLI 命令:
- node dist/cli/index.js areflect "[LEARN] insight: ..."
- node dist/cli/index.js share "<广播内容>"
- node dist/cli/index.js task-add "<标题>" "<描述>" <优先级>',
        'essential:core-advantage',
        ARRAY['essential', 'postgresql', 'areflect', 'design-principle'],
        10,
        jsonb_build_object('category', 'architecture'),
        NOW(),
        NOW()
    )
    ON CONFLICT DO NOTHING;

    -- Update bootstrap state
    UPDATE bootstrap_state 
    SET essential_loaded = TRUE, last_bootstrap_at = NOW() 
    WHERE id = 'main';
    
    RAISE NOTICE 'Essential knowledge loaded successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to check if bootstrap is needed
CREATE OR REPLACE FUNCTION needs_bootstrap()
RETURNS BOOLEAN AS $$
DECLARE
    v_state bootstrap_state;
BEGIN
    SELECT * INTO v_state FROM bootstrap_state WHERE id = 'main';
    
    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;
    
    RETURN NOT (v_state.essential_loaded AND v_state.skills_loaded);
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

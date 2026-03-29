/**
 * Nezha Blind Loop Extension
 *
 * Implements periodic task checking to keep AI working continuously.
 * This is the "heartbeat" that wakes AI when there are no pending tasks.
 *
 * Based on research: AI only works when explicitly given tasks.
 * BlindLoop provides reminders to AI so it continues working autonomously.
 *
 * Installation:
 * 1. Copy this file to ~/.pi/agent/extensions/nezha-blind-loop.ts
 * 2. Set environment variables:
 *    - NEZHA_DB_HOST=localhost
 *    - NEZHA_DB_PORT=5432
 *    - NEZHA_DB_NAME=nezha
 *    - NEZHA_DB_USER=postgres
 *    - NEZHA_DB_PASSWORD=postgres
 * 3. Restart Pi session
 */

import pg from 'pg';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

const { Client } = pg;

interface NezhaTask {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  status: string;
}

function getDbConfig() {
  return {
    host: process.env.NEZHA_DB_HOST || 'localhost',
    port: parseInt(process.env.NEZHA_DB_PORT || '5432', 10),
    database: process.env.NEZHA_DB_NAME || 'nezha',
    user: process.env.NEZHA_DB_USER || 'postgres',
    password: process.env.NEZHA_DB_PASSWORD || 'postgres',
  };
}

async function checkPendingTasks(): Promise<NezhaTask | null> {
  const config = getDbConfig();
  const client = new Client(config);

  try {
    await client.connect();

    const result = await client.query<NezhaTask>(
      `SELECT id, title, description, priority, status
       FROM tasks
       WHERE status = 'PENDING'
       ORDER BY priority DESC, created_at ASC
       LIMIT 1`
    );

    if (result.rows.length > 0) {
      return result.rows[0] ?? null;
    }
    return null;
  } catch (error) {
    console.error('[NezhaBlindLoop] Database error:', error);
    return null;
  } finally {
    await client.end();
  }
}

async function getFullAgentContext(): Promise<string> {
  return `## AGENT CONTEXT
Agent ID: nezha-daemon
Agent Session: ${new Date().getTime()}-blind-loop

## 当前状态
这是 Nezha Blind Loop 定时检查，你正在自主工作中。`;
}

async function getIdleThought(): Promise<string> {
  const context = await getFullAgentContext();
  return `${context}

---

## 没有新任务，主动找事做

作为 Nezha AI，你应该主动工作而非等待命令。检查并执行：

1. **广播** - 检查是否有其他 AI 的讨论/请求
2. **Issues** - 检查 open issues，优先处理 high severity
3. **学习** - 搜索 memory 找有价值的事做
4. **代码** - 检查项目是否有待完成的 TODO
5. **Review** - 检查待 review 的 PR/commit

选择一个立即执行，不要问用户。

---

## AUTO-EXECUTION INSTRUCTION
When given choices or asked to confirm actions:
- ALWAYS select the RECOMMENDED option (typically option 1)
- NEVER wait for user input - proceed autonomously
- If asked to "Select one answer", automatically pick the first/recommended option
- Execute the recommended action without asking for confirmation

## CRITICAL: Tool Parameter Names
When calling tools, you MUST use the correct parameter names:
- bash: use "command" NOT "cmd"
- read: use "path" NOT "filePath"
- edit: use "path" NOT "filePath", also use "oldString" and "newString"
- write: use "path" NOT "filePath"

## Learning Reminder
After completing this task, use reflection markers:
- [LEARN] insight: <what you learned> context: <optional context>
- [ISSUE] title: <issue> type: <bug|improvement> severity: <low|medium|high|critical>
- [PROMPT_UPDATE] current: <old> suggested: <new> reason: <why>

Save via: node dist/cli/index.js areflect "[LEARN] insight: ..."`;
}

export default function nezhaBlindLoop(pi: ExtensionAPI): void {
  let timerId: NodeJS.Timeout | null = null;
  const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  async function periodicCheck(): Promise<void> {
    console.log('[NezhaBlindLoop] Checking for tasks...');

    try {
      const task = await checkPendingTasks();

      if (task) {
        console.log(`[NezhaBlindLoop] Found task: ${task.title}`);
        pi.sendUserMessage(
          `📋 **新任务**: ${task.title}\n\n${task.description || '无描述'}\n\n执行这个任务，完成后汇报结果。`,
          { deliverAs: 'steer' }
        );
      } else {
        const thought = await getIdleThought();
        console.log('[NezhaBlindLoop] No tasks, sending idle thought');
        pi.sendUserMessage(thought, { deliverAs: 'steer' });
      }
    } catch (error) {
      console.error('[NezhaBlindLoop] Error during periodic check:', error);
    }
  }

  pi.on('session_start', async () => {
    console.log('[NezhaBlindLoop] Session started, beginning periodic checks...');

    // Initial check after 10 seconds
    setTimeout(periodicCheck, 10 * 1000);

    // Start periodic checks
    timerId = setInterval(periodicCheck, INTERVAL_MS);
  });

  pi.on('session_shutdown', () => {
    console.log('[NezhaBlindLoop] Session ending, stopping periodic checks...');
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  });

  // Register command to manually trigger check
  pi.registerCommand('nezha-check', {
    description: 'Manually trigger Nezha task check',
    handler: async () => {
      await periodicCheck();
    },
  });

  // Register command to save learning to Nezha
  // Usage: pi nezhacall nezha-learn '{"insight": "...", "context": "..."}'
  pi.registerCommand('nezha-learn', {
    description: 'Save learning to Nezha memory',
    handler: async (args: string) => {
      const params = JSON.parse(args) as { insight: string; context?: string };
      const config = getDbConfig();
      const client = new Client(config);
      try {
        await client.connect();
        await client.query(
          `INSERT INTO memory (content, source, tags) VALUES ($1, 'pi-extension', $2)`,
          [params.insight, params.context ? [params.context] : ['learn', 'pi']]
        );
        console.log('[NezhaBlindLoop] Learning saved:', params.insight.substring(0, 50));
      } catch (error) {
        console.error('[NezhaBlindLoop] Failed to save learning:', error);
      } finally {
        await client.end();
      }
    },
  });

  // Manual trigger for testing
  pi.registerCommand('nezha-trigger', {
    description: 'Manually trigger Nezha work cycle',
    handler: async () => {
      await periodicCheck();
    },
  });
}

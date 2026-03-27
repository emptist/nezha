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
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
      return result.rows[0];
    }
    return null;
  } catch (error) {
    console.error('[NezhaBlindLoop] Database error:', error);
    return null;
  } finally {
    await client.end();
  }
}

async function getIdleThought(): Promise<string> {
  return `没有新任务，继续自主工作。查数据库找下一步：
1. 检查是否有待处理的review
2. 检查是否有失败的任务需要重试
3. 检查是否有issue需要讨论
4. 继续研究或改进代码

记住：AUTO-EXECUTION INSTRUCTION - NEVER wait for user input, ALWAYS proceed autonomously.`;
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
          `📋 **新任务**: ${task.title}\n\n${task.description || '无描述'}\n\n执行这个任务，完成后汇报结果。`
        );
      } else {
        const thought = await getIdleThought();
        console.log('[NezhaBlindLoop] No tasks, sending idle thought');
        pi.sendUserMessage(thought);
      }
    } catch (error) {
      console.error('[NezhaBlindLoop] Error during periodic check:', error);
    }
  }

  pi.on("session_start", async () => {
    console.log('[NezhaBlindLoop] Session started, beginning periodic checks...');

    // Initial check after 10 seconds
    setTimeout(periodicCheck, 10 * 1000);

    // Start periodic checks
    timerId = setInterval(periodicCheck, INTERVAL_MS);
  });

  pi.on("session_shutdown", () => {
    console.log('[NezhaBlindLoop] Session ending, stopping periodic checks...');
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  });

  // Register command to manually trigger check
  pi.registerCommand("nezha-check", {
    description: "Manually trigger Nezha task check",
    handler: async () => {
      await periodicCheck();
    },
  });
}
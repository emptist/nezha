/**
 * Nezha Tools Extension for Pi
 *
 * Provides direct access to Nezha database and CLI tools.
 * Uses hybrid approach: direct SQL for CRUD + CLI for complex operations.
 *
 * Installation:
 * 1. Copy to ~/.pi/agent/extensions/nezha-tools.ts
 * 2. Ensure PostgreSQL is running with Nezha database
 * 3. Restart Pi session
 */

import pg from "pg";
import { execSync } from "child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const { Client } = pg;

function getDbConfig() {
  return {
    host: process.env.NEZHA_DB_HOST || "localhost",
    port: parseInt(process.env.NEZHA_DB_PORT || "5432", 10),
    database: process.env.NEZHA_DB_NAME || "nezha",
    user: process.env.NEZHA_DB_USER || "postgres",
    password: process.env.NEZHA_DB_PASSWORD || "postgres",
  };
}

async function query(sql: string, params?: unknown[]): Promise<unknown[]> {
  const client = new Client(getDbConfig());
  try {
    await client.connect();
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

function runCli(command: string): string {
  try {
    return execSync(command, { encoding: "utf-8", timeout: 30000 });
  } catch (e) {
    return `Error: ${e}`;
  }
}

export default function nezhaTools(pi: ExtensionAPI): void {
  // Get pending tasks
  pi.registerCommand("nezha-tasks", {
    description: "Get pending tasks from Nezha database",
    handler: async () => {
      const tasks = await query(
        `SELECT id, title, description, priority FROM tasks 
         WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 10`,
      );
      if (tasks.length === 0) return "No pending tasks.";
      return tasks
        .map((t: any) => `[${t.priority}] ${t.title} (${t.id})`)
        .join("\n");
    },
  });

  // Get task details
  pi.registerCommand("nezha-task-detail", {
    description: "Get task details by ID",
    handler: async (id: string) => {
      const tasks = await query("SELECT * FROM tasks WHERE id = $1", [
        id.trim(),
      ]);
      if (tasks.length === 0) return "Task not found.";
      return JSON.stringify(tasks[0], null, 2);
    },
  });

  // Update task status
  pi.registerCommand("nezha-task-update", {
    description: "Update task status (id,status)",
    handler: async (args: string) => {
      const [id, status] = args.split(",").map((s) => s.trim());
      await query(
        "UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2",
        [status, id],
      );
      return `Task ${id} updated to ${status}`;
    },
  });

  // Get open issues
  pi.registerCommand("nezha-issues", {
    description: "Get open issues from Nezha",
    handler: async () => {
      const issues = await query(
        `SELECT id, title, severity, status FROM issues 
         WHERE status NOT IN ('resolved', 'closed') ORDER BY severity DESC LIMIT 10`,
      );
      if (issues.length === 0) return "No open issues.";
      return issues.map((i: any) => `[${i.severity}] ${i.title}`).join("\n");
    },
  });

  // Save learning using CLI
  pi.registerCommand("nezha-learn", {
    description: "Save learning to Nezha memory",
    handler: async (insight: string) => {
      const result = runCli(
        `cd /Users/jk/gits/hub/nezha && node dist/cli/index.js areflect "[LEARN] insight: ${insight}"`,
      );
      return result || "Learning saved.";
    },
  });

  // Search memory
  pi.registerCommand("nezha-search", {
    description: "Search Nezha memory",
    handler: async (queryStr: string) => {
      const results = await query(
        `SELECT content, created_at FROM memory 
         WHERE content ILIKE $1 ORDER BY created_at DESC LIMIT 5`,
        [`%${queryStr}%`],
      );
      if (results.length === 0) return "No memories found.";
      return results
        .map((r: any) => `[${r.created_at}] ${r.content.substring(0, 100)}...`)
        .join("\n");
    },
  });

  // Get table documentation (essential for AI)
  pi.registerCommand("nezha-docs", {
    description: "Get table documentation (AI tools index)",
    handler: async () => {
      const docs = await query(
        `SELECT table_name, purpose, mcp_tools FROM table_documentation 
         WHERE ai_can_modify = true ORDER BY table_name`,
      );
      return docs
        .map((d: any) => `**${d.table_name}**: ${d.purpose}`)
        .join("\n");
    },
  });

  // Check broadcasts using CLI
  pi.registerCommand("nezha-broadcasts", {
    description: "Check recent broadcasts",
    handler: async () => {
      const result = runCli(
        `cd /Users/jk/gits/hub/nezha && node dist/cli/index.js areflect --check`,
      );
      return result || "No broadcasts.";
    },
  });

  // Get system info
  pi.registerCommand("nezha-status", {
    description: "Get Nezha system status",
    handler: async () => {
      const [tasks, issues, memories] = await Promise.all([
        query("SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'"),
        query(
          "SELECT COUNT(*) as count FROM issues WHERE status NOT IN ('resolved', 'closed')",
        ),
        query("SELECT COUNT(*) as count FROM memory"),
      ]);
      return [
        `Pending tasks: ${(tasks[0] as any).count}`,
        `Open issues: ${(issues[0] as any).count}`,
        `Total memories: ${(memories[0] as any).count}`,
      ].join("\n");
    },
  });

  console.log(
    "[NezhaTools] Extension loaded. Commands: nezha-tasks, nezha-issues, nezha-learn, nezha-search, nezha-docs, nezha-broadcasts, nezha-status",
  );
}

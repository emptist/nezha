import { TaskRouter, ExecutorType } from '../router/TaskRouter.js';

export interface TaskContext {
  id: string;
  title: string;
  description?: string;
  priority: number;
}

export interface CoordinatorConfig {
  opencodeUrl: string;
  opencodeAuth?: { username: string; password: string };
  useAuth?: boolean;
}

export class TaskCoordinator {
  private router: TaskRouter;
  private config: CoordinatorConfig;
  private sessionId: string | null = null;

  constructor(config: CoordinatorConfig) {
    this.router = new TaskRouter();
    this.config = {
      useAuth: true,
      ...config,
    };
  }

  async execute(task: TaskContext): Promise<{ executor: ExecutorType; result: string }> {
    console.log(`[TaskCoordinator] Executing task "${task.title}" on OpenCode...`);

    try {
      const result = await this.executeOnOpenCode(task);
      return { executor: 'opencode', result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[TaskCoordinator] Failed to execute on OpenCode:`, errorMsg);
      return { executor: 'opencode', result: `Failed: ${errorMsg}` };
    }
  }

  private async executeOnOpenCode(task: TaskContext): Promise<string> {
    if (!this.sessionId) {
      await this.createSession();
    }

    if (!this.sessionId) {
      throw new Error('Failed to create OpenCode session');
    }

    const message = this.buildTaskMessage(task);

    const response = await fetch(`${this.config.opencodeUrl}/session/${this.sessionId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenCode message failed: ${response.status}`);
    }

    console.log(`[TaskCoordinator] Task sent to OpenCode, waiting for completion...`);

    const result = await this.waitForCompletion(300000);
    return result;
  }

  private async waitForCompletion(timeoutMs: number = 300000): Promise<string> {
    const pollInterval = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const response = await fetch(`${this.config.opencodeUrl}/session/${this.sessionId}`, {
          headers: this.getAuthHeader(),
        });

        if (!response.ok) continue;

        const data = (await response.json()) as { status?: string; result?: string };

        if (data.status === 'completed' || data.status === 'done') {
          console.log(`[TaskCoordinator] Session completed: ${data.status}`);
          return data.result || 'Task completed';
        }

        if (data.status === 'error' || data.status === 'failed') {
          console.log(`[TaskCoordinator] Session failed: ${data.status}`);
          return `Task failed: ${data.result || 'Unknown error'}`;
        }

        console.log(`[TaskCoordinator] Waiting... status: ${data.status}`);
      } catch (error) {
        console.log(`[TaskCoordinator] Poll error:`, error);
      }
    }

    return 'Task timeout - still processing';
  }

  private async createSession(): Promise<void> {
    const response = await fetch(`${this.config.opencodeUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
      body: JSON.stringify({ title: 'piano-coordinator-session' }),
    });

    if (response.ok) {
      const data = (await response.json()) as { id: string };
      this.sessionId = data.id;
      console.log(`[TaskCoordinator] Created session: ${this.sessionId}`);
    }
  }

  private buildTaskMessage(task: TaskContext): string {
    return `
## 任务

**标题**: ${task.title}
**描述**: ${task.description || '(无)'}
**优先级**: ${task.priority}

## 执行要求

1. 自主分析任务
2. 制定执行计划
3. 执行并完成
4. 完成后使用以下标记：
   - [LEARN] insight: <学到的>
   - [ISSUE] title: <问题> type: <类型> severity: <程度>
   - [TASK] title: <新任务> priority: <优先级>

Save via: node dist/cli/index.js areflect "[LEARN] insight: ..."
`;
  }

  private getAuthHeader(): Record<string, string> {
    if (!this.config.useAuth) return {};

    const username =
      this.config.opencodeAuth?.username || process.env.OPENCODE_SERVER_USERNAME || 'opencode';
    const password =
      this.config.opencodeAuth?.password || process.env.OPENCODE_SERVER_PASSWORD || 'nezha-secret';

    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${credentials}` };
  }

  setRouterConfig(config: Partial<TaskRouter['config']>) {
    this.router.setConfig(config);
  }
}

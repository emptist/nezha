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
}

export class TaskCoordinator {
  private router: TaskRouter;
  private config: CoordinatorConfig;
  private sessionId: string | null = null;

  constructor(config: CoordinatorConfig) {
    this.router = new TaskRouter();
    this.config = config;
  }

  async execute(task: TaskContext): Promise<{ executor: ExecutorType; result: string }> {
    const executor = this.router.route(task.title, task.description);

    console.log(`[TaskCoordinator] Routing task "${task.title}" to: ${executor}`);

    switch (executor) {
      case 'opencode':
        return { executor, result: await this.executeOnOpenCode(task) };
      case 'pi':
        return { executor, result: 'Pi execution not implemented yet' };
      case 'internal':
      default:
        return { executor, result: 'Use internal AI (current behavior)' };
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
      body: JSON.stringify({ content: message }),
    });

    if (!response.ok) {
      throw new Error(`OpenCode message failed: ${response.status}`);
    }

    const data = (await response.json()) as { message?: { content?: string } };
    return data.message?.content || 'Task sent to OpenCode';
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
    if (this.config.opencodeAuth) {
      const credentials = Buffer.from(
        `${this.config.opencodeAuth.username}:${this.config.opencodeAuth.password}`
      ).toString('base64');
      return { Authorization: `Basic ${credentials}` };
    }
    return {};
  }

  setRouterConfig(config: Partial<TaskRouter['config']>) {
    this.router.setConfig(config);
  }
}

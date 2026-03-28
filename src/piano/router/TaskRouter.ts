export type ExecutorType = 'internal' | 'opencode' | 'pi' | 'hybrid';

export interface TaskRouterConfig {
  useOpenCode: boolean;
  usePi: boolean;
  complexityThreshold: number;
}

export class TaskRouter {
  private config: TaskRouterConfig;

  constructor(config: Partial<TaskRouterConfig> = {}) {
    this.config = {
      useOpenCode: config.useOpenCode ?? true,
      usePi: config.usePi ?? false,
      complexityThreshold: config.complexityThreshold ?? 50,
    };
  }

  route(taskTitle: string, taskDescription?: string): ExecutorType {
    const combined = `${taskTitle} ${taskDescription || ''}`;
    const complexity = this.estimateComplexity(combined);

    if (complexity >= this.config.complexityThreshold && this.config.useOpenCode) {
      return 'opencode';
    }

    if (this.config.usePi) {
      return 'pi';
    }

    return 'internal';
  }

  private estimateComplexity(text: string): number {
    let score = 0;

    const complexKeywords = [
      'debug',
      'refactor',
      'create',
      'implement',
      'design',
      'architecture',
      'api',
      'database',
      'test',
      'security',
      'performance',
      'optimize',
      'migration',
      'integration',
    ];

    const simpleKeywords = ['check', 'list', 'show', 'get', 'read', 'view'];

    for (const kw of complexKeywords) {
      if (text.toLowerCase().includes(kw)) score += 10;
    }

    for (const kw of simpleKeywords) {
      if (text.toLowerCase().includes(kw)) score -= 5;
    }

    score += Math.min(text.length / 10, 20);

    return Math.max(0, Math.min(100, score));
  }

  setConfig(config: Partial<TaskRouterConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TaskRouterConfig {
    return { ...this.config };
  }
}

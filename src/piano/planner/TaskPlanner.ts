import type { TaskContext } from '../coordinator/TaskCoordinator.js';

export interface PlannedTask extends TaskContext {
  subtasks: SubTask[];
  estimatedDuration: number;
}

export interface SubTask {
  title: string;
  description: string;
  priority: number;
  dependsOn?: string[];
}

export class TaskPlanner {
  plan(task: TaskContext): PlannedTask {
    const subtasks = this.decompose(task);
    const estimatedDuration = this.estimateDuration(subtasks);

    return {
      ...task,
      subtasks,
      estimatedDuration,
    };
  }

  private decompose(task: TaskContext): SubTask[] {
    const title = task.title.toLowerCase();
    const subtasks: SubTask[] = [];

    if (title.includes('create') || title.includes('implement')) {
      subtasks.push({
        title: `分析: ${task.title}`,
        description: '分析需求和技术方案',
        priority: task.priority,
      });
    }

    if (title.includes('api') || title.includes('database')) {
      subtasks.push({
        title: `设计: ${task.title}`,
        description: '设计接口和数据模型',
        priority: task.priority,
        dependsOn: ['analysis'],
      });
    }

    if (title.includes('test')) {
      subtasks.push({
        title: `实现: ${task.title}`,
        description: '编写测试用例',
        priority: task.priority,
      });
    }

    if (subtasks.length === 0) {
      subtasks.push({
        title: `执行: ${task.title}`,
        description: task.description || '执行任务',
        priority: task.priority,
      });
    }

    return subtasks;
  }

  private estimateDuration(subtasks: SubTask[]): number {
    return subtasks.length * 15;
  }

  shouldParallelize(subtasks: SubTask[]): boolean {
    return subtasks.every(st => !st.dependsOn || st.dependsOn.length === 0);
  }
}

import { ImprovementIdentifier, Improvement } from './ImprovementIdentifier.js';
import { MemoryService } from './MemoryService.js';
import { ConversationLogger } from './ConversationLogger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: number;
  category: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TaskResult;
}

export interface TaskResult {
  success: boolean;
  output: string;
  artifacts: string[];
  duration: number;
  error?: string;
}

export interface Review {
  success: boolean;
  score: number;
  feedback: string[];
  improvements: Improvement[];
}

export interface Learning {
  timestamp: Date;
  task: {
    id: string;
    title: string;
    category: string;
  };
  result: {
    success: boolean;
    duration: number;
    artifacts: string[];
  };
  review: {
    score: number;
    feedback: string[];
  };
  insights: string[];
  patterns: string[];
  recommendations: string[];
}

export class ContinuousImprovementLoop {
  private identifier: ImprovementIdentifier;
  private memoryService: MemoryService;
  private conversationLogger: ConversationLogger;
  private isRunning: boolean = false;
  private cycleCount: number = 0;
  private projectRoot: string;

  constructor(
    projectRoot: string = process.cwd(),
    memoryService: MemoryService,
    conversationLogger: ConversationLogger
  ) {
    this.projectRoot = projectRoot;
    this.identifier = new ImprovementIdentifier(projectRoot);
    this.memoryService = memoryService;
    this.conversationLogger = conversationLogger;
  }

  async start(): Promise<void> {
    this.isRunning = true;

    await this.logStatus('Continuous improvement system started');

    while (this.isRunning) {
      try {
        this.cycleCount++;
        await this.runOneCycle();

        await this.sleep(30000);
      } catch (error) {
        console.error(`Cycle ${this.cycleCount} failed:`, error);
        await this.logError(error as Error);
        await this.sleep(60000);
      }
    }
  }

  stop(): void {
    this.isRunning = false;
  }

  private async runOneCycle(): Promise<void> {
    const improvements = await this.identifier.identify();
    if (improvements.length === 0) {
      return;
    }

    const tasks = await this.convertImprovementsToTasks(improvements);
    const results = await this.executeTasks(tasks);
    const reviews = await this.reviewResults(tasks, results);
    await this.recordLearning(tasks, results, reviews);
    await this.commitAndPush();
  }

  private async convertImprovementsToTasks(improvements: Improvement[]): Promise<Task[]> {
    const tasks: Task[] = [];

    for (const improvement of improvements.slice(0, 3)) {
      const task: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: improvement.title,
        description: improvement.description,
        priority: improvement.priority,
        category: improvement.category,
        status: 'pending',
        createdAt: new Date(),
      };

      tasks.push(task);
    }

    return tasks;
  }

  private async executeTasks(tasks: Task[]): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    for (const task of tasks) {
      task.status = 'running';
      task.startedAt = new Date();

      const result = await this.executeTask(task);
      task.result = result;
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = new Date();

      results.push(result);
    }

    return results;
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      let output = '';
      const artifacts: string[] = [];

      switch (task.category) {
        case 'infrastructure':
          if (task.title.includes('Commit')) {
            output = await this.executeCommitTask();
          } else if (task.title.includes('Push')) {
            output = await this.executePushTask();
          } else {
            output = `Infrastructure task: ${task.title}\nManual intervention required`;
          }
          break;

        case 'code':
          output = `Code improvement task: ${task.title}\nManual code review required`;
          break;

        case 'documentation':
          output = `Documentation task: ${task.title}\nManual documentation required`;
          break;

        case 'testing':
          output = `Testing task: ${task.title}\nManual test creation required`;
          break;

        case 'feature':
          output = `Feature implementation: ${task.title}\nManual implementation required`;
          break;

        default:
          output = `Generic task: ${task.title}`;
      }

      return {
        success: true,
        output,
        artifacts,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : 'Unknown error',
        artifacts: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async executeCommitTask(): Promise<string> {
    try {
      const { stdout: status } = await execAsync('git status --porcelain');

      if (status.trim().length === 0) {
        return 'No changes to commit';
      }

      await execAsync('git add -A');
      await execAsync(`git commit -m "auto: continuous improvement - ${new Date().toISOString()}"`);

      return 'Changes committed successfully';
    } catch (error) {
      return `Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async executePushTask(): Promise<string> {
    try {
      await execAsync('git push');
      return 'Changes pushed successfully';
    } catch (error) {
      return `Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async reviewResults(tasks: Task[], results: TaskResult[]): Promise<Review[]> {
    const reviews: Review[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const result = results[i];

      const review: Review = {
        success: result.success,
        score: this.calculateScore(result),
        feedback: this.generateFeedback(result),
        improvements: result.success
          ? []
          : [
              {
                type: 'improvement',
                title: `Retry: ${task.title}`,
                description: `Task failed: ${result.error || 'Unknown error'}`,
                priority: task.priority,
                category: task.category as any,
                autoFixable: false,
              },
            ],
      };

      reviews.push(review);
    }

    return reviews;
  }

  private calculateScore(result: TaskResult): number {
    let score = 100;

    if (!result.success) {
      score -= 50;
    }

    if (result.duration > 60000) {
      score -= 10;
    }

    if (result.artifacts.length > 0) {
      score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private generateFeedback(result: TaskResult): string[] {
    const feedback: string[] = [];

    if (result.success) {
      feedback.push('Task completed successfully');
      feedback.push(`Duration: ${result.duration}ms`);

      if (result.artifacts.length > 0) {
        feedback.push(`Artifacts: ${result.artifacts.join(', ')}`);
      }
    } else {
      feedback.push('Task failed');
      feedback.push(`Error: ${result.error || 'Unknown error'}`);
    }

    return feedback;
  }

  private async recordLearning(
    tasks: Task[],
    results: TaskResult[],
    reviews: Review[]
  ): Promise<void> {
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const result = results[i];
      const review = reviews[i];

      const learning: Learning = {
        timestamp: new Date(),
        task: {
          id: task.id,
          title: task.title,
          category: task.category,
        },
        result: {
          success: result.success,
          duration: result.duration,
          artifacts: result.artifacts,
        },
        review: {
          score: review.score,
          feedback: review.feedback,
        },
        insights: this.extractInsights(task, result, review),
        patterns: this.extractPatterns(task, result, review),
        recommendations: this.generateRecommendations(task, result, review),
      };

      await this.memoryService.store({
        type: 'learning',
        content: learning,
        metadata: {
          taskId: task.id,
          category: task.category,
          success: result.success,
          score: review.score,
        },
      });
    }
  }

  private extractInsights(task: Task, result: TaskResult, review: Review): string[] {
    const insights: string[] = [];

    if (result.success) {
      insights.push(`${task.category} tasks can be automated`);
    } else {
      insights.push(`${task.category} tasks require manual intervention`);
    }

    if (result.duration > 30000) {
      insights.push('Task took longer than expected');
    }

    return insights;
  }

  private extractPatterns(task: Task, result: TaskResult, review: Review): string[] {
    const patterns: string[] = [];

    if (task.category === 'infrastructure' && result.success) {
      patterns.push('Infrastructure tasks are highly automatable');
    }

    if (task.category === 'code' && !result.success) {
      patterns.push('Code tasks often require human judgment');
    }

    return patterns;
  }

  private generateRecommendations(task: Task, result: TaskResult, review: Review): string[] {
    const recommendations: string[] = [];

    if (!result.success) {
      recommendations.push(`Consider alternative approaches for ${task.category} tasks`);
    }

    if (review.score < 70) {
      recommendations.push('Review and improve task execution strategy');
    }

    return recommendations;
  }

  private async commitAndPush(): Promise<void> {
    try {
      const { stdout: status } = await execAsync('git status --porcelain');

      if (status.trim().length > 0) {
        await execAsync('git add -A');
        await execAsync(`git commit -m "auto: continuous improvement cycle ${this.cycleCount}"`);
        await execAsync('git push');
      } else {
      }
    } catch (error) {
      console.error('   Failed to commit and push:', error);
    }
  }

  private async logStatus(message: string): Promise<void> {
    const statusFile = path.join(this.projectRoot, 'CONTINUOUS_WORK_STATUS.md');

    const timestamp = new Date().toISOString();
    const logEntry = `\n### ${timestamp}\n${message}\n`;

    await fs.appendFile(statusFile, logEntry);
  }

  private async logError(error: Error): Promise<void> {
    const statusFile = path.join(this.projectRoot, 'CONTINUOUS_WORK_STATUS.md');

    const timestamp = new Date().toISOString();
    const logEntry = `\n### ${timestamp} - ERROR\n\`\`\`\n${error.message}\n${error.stack}\n\`\`\`\n`;

    await fs.appendFile(statusFile, logEntry);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

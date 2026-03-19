import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface Improvement {
  type: 'critical' | 'improvement' | 'optimization' | 'feature';
  title: string;
  description: string;
  priority: number; // 1-10, 10 is highest
  category: 'infrastructure' | 'code' | 'documentation' | 'testing' | 'feature';
  autoFixable: boolean;
}

export interface SystemStatus {
  database: {
    connected: boolean;
    error?: string;
  };
  codeQuality: {
    hasIssues: boolean;
    issues: string[];
  };
  documentation: {
    complete: boolean;
    missing: string[];
  };
  testCoverage: {
    percentage: number;
    missing: string[];
  };
  git: {
    hasUncommittedChanges: boolean;
    hasUnpushedCommits: boolean;
  };
}

export class ImprovementIdentifier {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async identify(): Promise<Improvement[]> {
    const improvements: Improvement[] = [];

    const status = await this.checkSystemStatus();

    improvements.push(...this.analyzeSystemStatus(status));

    improvements.push(...(await this.identifyCodeImprovements()));

    improvements.push(...(await this.identifyDocumentationImprovements()));

    improvements.push(...(await this.identifyTestImprovements()));

    improvements.push(...(await this.identifyFeatureImprovements()));

    return this.prioritizeImprovements(improvements);
  }

  private async checkSystemStatus(): Promise<SystemStatus> {
    const status: SystemStatus = {
      database: await this.checkDatabaseStatus(),
      codeQuality: await this.checkCodeQuality(),
      documentation: await this.checkDocumentation(),
      testCoverage: await this.checkTestCoverage(),
      git: await this.checkGitStatus(),
    };

    return status;
  }

  private async checkDatabaseStatus(): Promise<SystemStatus['database']> {
    try {
      const { DatabaseClient } = await import('../db/DatabaseClient.js');
      const { Config } = await import('../config/Config.js');
      const config = Config.getInstance();
      const db = new DatabaseClient(config);
      await db.query('SELECT 1');
      await db.close();
      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkCodeQuality(): Promise<SystemStatus['codeQuality']> {
    const issues: string[] = [];

    try {
      await execAsync('npm run lint 2>&1 || true');
    } catch {
      issues.push('Linting errors found');
    }

    try {
      await execAsync('npm run typecheck 2>&1 || true');
    } catch {
      issues.push('Type errors found');
    }

    return {
      hasIssues: issues.length > 0,
      issues,
    };
  }

  private async checkDocumentation(): Promise<SystemStatus['documentation']> {
    const missing: string[] = [];

    const requiredDocs = [
      'README.md',
      'docs/DEVELOPER_GUIDE.md',
      'docs/USER_GUIDE.md',
      'docs/IMPROVEMENT_PLAN.md',
    ];

    for (const doc of requiredDocs) {
      const docPath = path.join(this.projectRoot, doc);
      if (!(await fs.pathExists(docPath))) {
        missing.push(doc);
      }
    }

    return {
      complete: missing.length === 0,
      missing,
    };
  }

  private async checkTestCoverage(): Promise<SystemStatus['testCoverage']> {
    const missing: string[] = [];

    const srcDir = path.join(this.projectRoot, 'src');
    const testDir = path.join(this.projectRoot, 'tests');

    if (!(await fs.pathExists(testDir))) {
      missing.push('tests/ directory missing');
      return {
        percentage: 0,
        missing,
      };
    }

    const srcFiles = await this.findFiles(srcDir, '.ts');
    const testFiles = await this.findFiles(testDir, '.test.ts');

    const percentage =
      srcFiles.length > 0 ? Math.round((testFiles.length / srcFiles.length) * 100) : 0;

    return {
      percentage,
      missing,
    };
  }

  private async checkGitStatus(): Promise<SystemStatus['git']> {
    try {
      const { stdout: status } = await execAsync('git status --porcelain');
      const hasUncommittedChanges = status.trim().length > 0;

      const { stdout: unpushed } = await execAsync('git log @{u}..HEAD --oneline 2>&1 || echo ""');
      const hasUnpushedCommits = unpushed.trim().length > 0;

      return {
        hasUncommittedChanges,
        hasUnpushedCommits,
      };
    } catch (error) {
      return {
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
      };
    }
  }

  private analyzeSystemStatus(status: SystemStatus): Improvement[] {
    const improvements: Improvement[] = [];

    if (!status.database.connected) {
      improvements.push({
        type: 'critical',
        title: 'Fix database connection',
        description: `Database connection failed: ${status.database.error}`,
        priority: 10,
        category: 'infrastructure',
        autoFixable: false,
      });
    }

    if (status.codeQuality.hasIssues) {
      improvements.push({
        type: 'improvement',
        title: 'Fix code quality issues',
        description: status.codeQuality.issues.join('\n'),
        priority: 8,
        category: 'code',
        autoFixable: true,
      });
    }

    if (!status.documentation.complete) {
      improvements.push({
        type: 'improvement',
        title: 'Complete missing documentation',
        description: `Missing: ${status.documentation.missing.join(', ')}`,
        priority: 6,
        category: 'documentation',
        autoFixable: true,
      });
    }

    if (status.testCoverage.percentage < 80) {
      improvements.push({
        type: 'improvement',
        title: 'Improve test coverage',
        description: `Current coverage: ${status.testCoverage.percentage}%`,
        priority: 7,
        category: 'testing',
        autoFixable: true,
      });
    }

    if (status.git.hasUncommittedChanges) {
      improvements.push({
        type: 'improvement',
        title: 'Commit pending changes',
        description: 'There are uncommitted changes in the repository',
        priority: 5,
        category: 'infrastructure',
        autoFixable: true,
      });
    }

    if (status.git.hasUnpushedCommits) {
      improvements.push({
        type: 'improvement',
        title: 'Push commits to remote',
        description: 'There are unpushed commits',
        priority: 5,
        category: 'infrastructure',
        autoFixable: true,
      });
    }

    return improvements;
  }

  private async identifyCodeImprovements(): Promise<Improvement[]> {
    const improvements: Improvement[] = [];

    const srcDir = path.join(this.projectRoot, 'src');
    const files = await this.findFiles(srcDir, '.ts');

    for (const file of files.slice(0, 10)) {
      const content = await fs.readFile(file, 'utf-8');

      if (content.includes('TODO') || content.includes('FIXME')) {
        improvements.push({
          type: 'improvement',
          title: `Fix TODOs in ${path.basename(file)}`,
          description: 'File contains TODO or FIXME comments',
          priority: 6,
          category: 'code',
          autoFixable: true,
        });
      }

      if (content.includes('console.log')) {
        improvements.push({
          type: 'optimization',
          title: `Remove console.log from ${path.basename(file)}`,
          description: 'Use proper logging instead of console.log',
          priority: 4,
          category: 'code',
          autoFixable: true,
        });
      }
    }

    return improvements;
  }

  private async identifyDocumentationImprovements(): Promise<Improvement[]> {
    const improvements: Improvement[] = [];

    const docsDir = path.join(this.projectRoot, 'docs');
    if (!(await fs.pathExists(docsDir))) {
      improvements.push({
        type: 'improvement',
        title: 'Create docs directory',
        description: 'Documentation directory is missing',
        priority: 7,
        category: 'documentation',
        autoFixable: true,
      });
    }

    return improvements;
  }

  private async identifyTestImprovements(): Promise<Improvement[]> {
    const improvements: Improvement[] = [];

    const testDir = path.join(this.projectRoot, 'tests');
    if (!(await fs.pathExists(testDir))) {
      improvements.push({
        type: 'improvement',
        title: 'Create test directory',
        description: 'Test directory is missing',
        priority: 8,
        category: 'testing',
        autoFixable: true,
      });
    }

    return improvements;
  }

  private async identifyFeatureImprovements(): Promise<Improvement[]> {
    const improvements: Improvement[] = [];

    const coreDir = path.join(this.projectRoot, 'src/core');
    const expectedFiles = ['ImprovementIdentifier.ts', 'ResultReviewer.ts', 'LearningRecorder.ts'];

    for (const file of expectedFiles) {
      const filePath = path.join(coreDir, file);
      if (!(await fs.pathExists(filePath))) {
        improvements.push({
          type: 'feature',
          title: `Implement ${file.replace('.ts', '')}`,
          description: `Missing core component: ${file}`,
          priority: 7,
          category: 'feature',
          autoFixable: true,
        });
      }
    }

    return improvements;
  }

  private async findFiles(dir: string, ext: string): Promise<string[]> {
    const files: string[] = [];

    if (!(await fs.pathExists(dir))) {
      return files;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.findFiles(fullPath, ext)));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private prioritizeImprovements(improvements: Improvement[]): Improvement[] {
    return improvements.sort((a, b) => b.priority - a.priority);
  }
}

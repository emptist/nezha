import { clawHubClient } from '../services/ClawHubClient.js';
import { taskReviewSkill, type TaskReviewInput } from '../services/TaskReviewSkill.js';
import { databaseSkillLoader } from '../services/DatabaseSkillLoader.js';
import { ReviewService, type ReviewFinding } from '../services/ReviewService.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { colors } from '../utils/cli.js';

interface ReviewRow {
  id: string;
  task_id?: string;
  status: string;
  findings_json?: string;
  created_at?: Date | string;
  severity?: string;
  title?: string;
  reviewType?: string;
  reviewerId?: string;
  createdAt?: Date | string;
  findings?: unknown[];
  actionItems?: unknown[];
  [key: string]: unknown;
}

export async function reviewTask(
  taskId: string,
  taskTitle: string,
  taskDescription: string,
  result: unknown,
  options?: {
    error?: string;
    duration?: number;
    filesChanged?: string[];
    testsRun?: boolean;
    testsPassed?: boolean;
  }
): Promise<void> {
  console.log('\n🔍 Running task review...\n');

  const input: TaskReviewInput = {
    taskId,
    taskTitle,
    taskDescription,
    result,
    error: options?.error,
    duration: options?.duration || 0,
    filesChanged: options?.filesChanged,
    testsRun: options?.testsRun,
    testsPassed: options?.testsPassed,
  };

  const review = await taskReviewSkill.review(input);

  console.log('='.repeat(60));
  console.log(`📋 Task Review: ${taskTitle}`);
  console.log('='.repeat(60));

  const statusIcon = review.passed ? '✅' : '❌';
  console.log(`\n${statusIcon} Status: ${review.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`📊 Quality Score: ${review.score}/100`);
  console.log(`🏆 Quality Level: ${review.qualityLevel.toUpperCase()}`);

  if (review.issues.length > 0) {
    console.log('\n⚠️  Issues Found:');
    for (const issue of review.issues) {
      const icon =
        issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      console.log(`  ${icon} [${issue.severity}] ${issue.category}`);
      console.log(`     ${issue.message}`);
      if (issue.fixSuggestion) {
        console.log(`     💡 Fix: ${issue.fixSuggestion}`);
      }
    }
  }

  if (review.suggestions.length > 0) {
    console.log('\n💡 Suggestions:');
    for (const suggestion of review.suggestions) {
      console.log(`  • ${suggestion}`);
    }
  }

  if (review.learnedPatterns.length > 0) {
    console.log('\n🧠 Learned Patterns:');
    for (const pattern of review.learnedPatterns) {
      console.log(`  • ${pattern}`);
    }
    console.log('\n  📝 These patterns have been saved to memory for future reference.');
  }

  console.log('\n' + '-'.repeat(60));

  if (!review.passed) {
    console.log('\n❌ Task did not pass quality review.');
    console.log('   Review the issues above and consider reworking the solution.\n');
  } else if (review.qualityLevel === 'excellent') {
    console.log('\n🌟 Excellent work! This solution sets a high standard.\n');
  } else {
    console.log('\n✅ Task completed successfully.\n');
  }
}

export async function browseClawHubSkills(query?: string, tags?: string[]): Promise<void> {
  console.log(`\n🔍 Searching ClawHub for: ${query || 'all skills'}...`);

  const skills = await clawHubClient.searchSkills({ query, tags, limit: 10 });

  if (skills.length === 0) {
    console.log('No skills found.');
    return;
  }

  console.log(`\nFound ${skills.length} skill(s):\n`);

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    if (!skill) continue;

    const review = await clawHubClient.reviewSkill(skill);

    const status = review.isSafe ? '✓' : '✗';
    const scoreColor =
      review.score >= 80 ? '\x1b[32m' : review.score >= 60 ? '\x1b[33m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`${i + 1}. ${status} ${skill.name} ${skill.verified ? '(verified)' : ''}`);
    console.log(`   ${skill.description}`);
    console.log(
      `   Author: ${skill.author} | Downloads: ${skill.downloads} | Rating: ${skill.rating}`
    );
    console.log(`   Safety: ${scoreColor}${review.score}/100${reset}`);

    if (review.warnings.length > 0) {
      console.log(`   ⚠ ${review.warnings.length} warning(s)`);
    }

    if (!review.isSafe) {
      console.log(`   ❌ BLOCKED: ${review.issues.join(', ')}`);
    }

    console.log();
  }
}

export async function installSkillFromClawHub(
  skillId: string,
  autoApprove = false
): Promise<boolean> {
  console.log(`\n📦 Installing skill: ${skillId}`);

  const skills = await clawHubClient.searchSkills({ query: skillId, limit: 1 });

  if (skills.length === 0) {
    console.log(`Skill not found: ${skillId}`);
    return false;
  }

  const skill = skills[0];
  if (!skill) {
    console.log(`Skill not found: ${skillId}`);
    return false;
  }

  const review = await clawHubClient.reviewSkill(skill);

  console.log('\n' + '='.repeat(60));
  console.log(`📦 ${skill.name}`);
  console.log('='.repeat(60));
  console.log(`Description: ${skill.description}`);
  console.log(`Author: ${skill.author}`);
  console.log(`Safety Score: ${review.score}/100`);

  if (review.codeAnalysis?.permissions.length) {
    console.log(`\n🔒 Required Permissions: ${review.codeAnalysis.permissions.join(', ')}`);
  }

  if (!review.isSafe) {
    console.log('\n❌ BLOCKED: This skill failed safety review.');
    console.log(`   Issues: ${review.issues.join(', ')}`);
    return false;
  }

  if (!autoApprove) {
    console.log('\n⚠️  This skill will be saved to the database.');
    console.log('   It requires admin approval before use.\n');
    console.log('   To auto-approve, use: --auto-approve\n');
  }

  const skillId_saved = await databaseSkillLoader.saveSkillFromClawHub(skill, review);

  if (skillId_saved) {
    console.log(`✅ Skill saved to database (ID: ${skillId_saved})`);
    console.log('   Run: nezha skills approve ' + skillId_saved + '\n');
    return true;
  }

  console.log('❌ Failed to save skill to database.\n');
  return false;
}

export async function listDatabaseSkills(): Promise<void> {
  const skills = await databaseSkillLoader.getAllSkills();

  if (skills.length === 0) {
    console.log('\n📦 No skills in database.');
    console.log('   Use: nezha skills install <skill-name>\n');
    return;
  }

  console.log(`\n📦 Database Skills (${skills.length}):\n`);

  for (const skill of skills) {
    const statusIcon =
      skill.status === 'approved' ? '✅' : skill.status === 'pending' ? '⏳' : '❌';
    const safetyIcon = skill.safety_score >= 80 ? '🟢' : skill.safety_score >= 60 ? '🟡' : '🔴';

    console.log(`  ${statusIcon} ${skill.name} ${safetyIcon}${skill.safety_score}`);
    console.log(`     ${skill.description || 'No description'}`);
    console.log(`     Used: ${skill.use_count}x | Version: ${skill.version}`);
    if (skill.tags.length > 0) {
      console.log(`     Tags: ${skill.tags.join(', ')}`);
    }
    console.log();
  }
}

export async function searchDatabaseSkills(query: string): Promise<void> {
  const results = await databaseSkillLoader.searchSkills(query);

  if (results.length === 0) {
    console.log(`\nNo skills found matching: ${query}\n`);
    return;
  }

  console.log(`\n🔍 Found ${results.length} skill(s):\n`);

  for (const skill of results) {
    console.log(`  📦 ${skill.name}`);
    console.log(`     ${skill.description || 'No description'}`);
    console.log(`     Safety: ${skill.safety_score}/100 | Used: ${skill.use_count}x`);
    console.log();
  }
}

export class ReviewManagementCommands {
  private readonly reviewService: ReviewService;

  constructor(db: DatabaseClient) {
    this.reviewService = new ReviewService(db);
  }

  async create(options: {
    type: 'code' | 'design' | 'qc' | 'peer' | 'task' | 'security' | 'other';
    target?: string;
    title: string;
    description?: string;
  }): Promise<void> {
    const id = await this.reviewService.createReview(
      options.type,
      options.title,
      options.target,
      undefined,
      options.description
    );

    console.log(`${colors.green}Review created: ${id}${colors.reset}`);
    console.log(`  Type: ${options.type}`);
    console.log(`  Title: ${options.title}`);
    if (options.target) console.log(`  Target: ${options.target}`);
  }

  async list(status?: string): Promise<void> {
    const reviews = await this.getReviewsByStatus(status);

    if (reviews.length === 0) {
      console.log('\nNo reviews found');
      return;
    }

    console.log(`\n${colors.bright}Reviews (${reviews.length}):${colors.reset}\n`);

    for (const review of reviews) {
      const statusColor = this.getStatusColor(review.status);
      console.log(`${statusColor}[${review.status.toUpperCase()}]${colors.reset} ${review.title}`);
      console.log(`  ID: ${review.id.substring(0, 8)}...`);
      console.log(
        `  Type: ${review.reviewType} | Reviewer: ${review.reviewerId?.substring(0, 8) || 'unassigned'}...`
      );
      console.log(`  Created: ${new Date(review.createdAt ?? review.created_at ?? new Date()).toLocaleString()}`);
      if (Array.isArray(review.findings) && review.findings.length > 0) {
        console.log(`  Findings: ${review.findings.length}`);
      }
      if (Array.isArray(review.actionItems) && review.actionItems.length > 0) {
        console.log(`  Action Items: ${review.actionItems.length}`);
      }
      console.log();
    }
  }

  async start(reviewId: string): Promise<void> {
    await this.reviewService.startReview(reviewId);
    console.log(`${colors.green}Review started: ${reviewId}${colors.reset}`);
  }

  async complete(
    reviewId: string,
    findings: ReviewFinding[],
    actionItems: { description: string }[]
  ): Promise<void> {
    await this.reviewService.completeReview(reviewId, findings, actionItems);
    console.log(`${colors.green}Review completed: ${reviewId}${colors.reset}`);
    console.log(`  Findings: ${findings.length}`);
    console.log(`  Action Items: ${actionItems.length}`);
  }

  async followUps(): Promise<void> {
    const reviews = await this.reviewService.getPendingFollowUps();

    if (reviews.length === 0) {
      console.log('\nNo pending follow-ups');
      return;
    }

    console.log(`\n${colors.bright}Follow-ups Required (${reviews.length}):${colors.reset}\n`);

    for (const review of reviews) {
      const dueDate = review.followUpDue ? new Date(review.followUpDue) : null;
      const isOverdue = dueDate && dueDate < new Date();

      console.log(
        `${isOverdue ? colors.red : colors.yellow}[${review.followUpStatus?.toUpperCase() || 'PENDING'}]${colors.reset} ${review.title}`
      );
      console.log(`  ID: ${review.id.substring(0, 8)}...`);
      console.log(`  Due: ${dueDate?.toLocaleString() || 'No deadline'}`);
      if (review.actionItems?.length > 0) {
        console.log(
          `  Pending Actions: ${review.actionItems.filter(a => a.status === 'pending').length}`
        );
      }
      console.log();
    }
  }

  async stats(): Promise<void> {
    const stats = await this.reviewService.getReviewStats();

    console.log(`\n${colors.bright}Review Statistics:${colors.reset}\n`);
    console.log(`Total Reviews: ${stats.total}`);
    console.log(`${colors.yellow}Pending: ${stats.pending}${colors.reset}`);
    console.log(`${colors.blue}In Progress: ${stats.inProgress}${colors.reset}`);
    console.log(`${colors.green}Completed: ${stats.completed}${colors.reset}`);
    console.log(`${colors.cyan}Follow-ups: ${stats.followUp}${colors.reset}`);
    if (stats.overdue > 0) {
      console.log(`${colors.red}Overdue: ${stats.overdue}${colors.reset}`);
    }
    if (stats.avgCompletionTimeHours > 0) {
      console.log(`\nAvg Completion Time: ${stats.avgCompletionTimeHours.toFixed(1)} hours`);
    }
  }

  private async getReviewsByStatus(status?: string): Promise<ReviewRow[]> {
    if (status) {
      const result = await this.reviewService['db'].query<ReviewRow>(
        `SELECT * FROM reviews WHERE status = $1 ORDER BY created_at DESC LIMIT 50`,
        [status]
      );
      return result.rows;
    }

    const result = await this.reviewService['db'].query<ReviewRow>(
      `SELECT * FROM reviews ORDER BY created_at DESC LIMIT 50`
    );
    return result.rows;
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return colors.green;
      case 'in_progress':
        return colors.blue;
      case 'follow_up':
        return colors.yellow;
      case 'closed':
        return colors.gray;
      default:
        return colors.white;
    }
  }
}

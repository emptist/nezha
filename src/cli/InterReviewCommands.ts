import { DatabaseClient } from '../db/DatabaseClient.js';
import { InterReviewService, type ReviewRequest } from '../services/InterReviewService.js';
import { Config } from '../config/Config.js';
import { getGitHash, getGitBranch, getGitDiff, getLastCommitMessage } from '../utils/git.js';
import { logger } from '../utils/logger.js';

const REVIWER_ID = `nezha-${Date.now()}`;

async function createReviewService(): Promise<InterReviewService> {
  const config = Config.getInstance();
  const db = new DatabaseClient(config);
  return InterReviewService.create(db);
}

export async function requestReviewFromAI(
  commitHash?: string,
  taskId?: string,
  taskDescription?: string
): Promise<void> {
  const reviewService = await createReviewService();

  let commit: string | undefined = commitHash;
  let commitMessage = '';
  let files: string[] = [];

  const branch = getGitBranch() || 'main';

  if (!commit) {
    const hash = getGitHash();
    commit = hash || undefined;
    commitMessage = getLastCommitMessage() || '';
    const diff = getGitDiff();
    files = diff ? diff.split('\n') : [];
    if (!commit || files.length === 0) {
      logger.warn('Failed to get git info - some information may be unavailable');
    }
  }

  const request: ReviewRequest = {
    taskId,
    commitHash: commit,
    branch,
    reviewerId: REVIWER_ID,
    context: {
      changes: 'Code changes from recent commits',
      files,
      taskDescription,
      message: commitMessage,
    },
  };

  console.log('\n🔍 Requesting AI review...\n');
  console.log(`   Commit: ${commit || 'N/A'}`);
  console.log(`   Branch: ${branch}`);
  if (files.length > 0) {
    console.log(`   Files: ${files.length} file(s) changed`);
  }
  console.log('');

  const reviewId = await reviewService.requestReview(request, false);
  console.log(`   Review ID: ${reviewId}`);

  const prompt = `You are a senior code reviewer with expertise in TypeScript, Node.js, and software best practices. Be constructive and thorough.`;

  console.log('\n⏳ AI is reviewing your code...\n');

  try {
    const result = await reviewService.performReview(reviewId, prompt);
    printReviewResult(result);
  } catch (error) {
    console.error('❌ Review failed:', error instanceof Error ? error.message : error);
    console.log('\n   You can retry by running: npm run review:request\n');
  }
}

export async function performAIReview(reviewId: string): Promise<void> {
  const reviewService = await createReviewService();

  const prompt = `You are a senior code reviewer with expertise in TypeScript, Node.js, and software best practices. Be constructive and thorough.`;

  console.log(`\n🔍 Performing review: ${reviewId}\n`);

  try {
    const result = await reviewService.performReview(reviewId, prompt);
    printReviewResult(result);
  } catch (error) {
    console.error('❌ Review failed:', error instanceof Error ? error.message : error);
  }
}

export async function respondToReview(
  reviewId: string,
  response: string,
  accepted?: string[],
  options?: {
    reviewedBy?: string;
    status?: 'accepted' | 'rejected' | 'partial' | 'superseded';
    leverageRatio?: number;
    reworkCount?: number;
    effortMinutes?: number;
  }
): Promise<void> {
  const reviewService = await createReviewService();
  await reviewService.respondToReview(reviewId, response, accepted || [], options);
  console.log(`✅ Response recorded for review: ${reviewId}`);
}

export async function showReview(reviewId?: string): Promise<void> {
  const reviewService = await createReviewService();

  if (reviewId) {
    const review = await reviewService.getReview(reviewId);
    if (review) {
      printReviewDetail(review);
    } else {
      console.log(`❌ Review not found: ${reviewId}`);
    }
  } else {
    const pending = await reviewService.getPendingReviews();
    if (pending.length === 0) {
      console.log('\n📋 No pending reviews\n');
    } else {
      console.log('\n📋 Pending Reviews\n');
      for (const r of pending) {
        console.log(
          `   ${r.id.slice(0, 8)}... | ${r.reviewerId} | ${Math.round(r.pendingMinutes)}m ago`
        );
      }
      console.log('');
    }
  }
}

export async function showReviewStats(): Promise<void> {
  const reviewService = await createReviewService();

  const stats = await reviewService.getReviewStats();
  console.log('\n📊 Inter-Review Statistics\n');
  console.log(`   Pending:   ${stats.pendingCount}`);
  console.log(`   Completed: ${stats.completedCount}`);
  console.log(`   Failed:    ${stats.failedCount}`);
  if (stats.avgScore !== null) {
    console.log(`   Avg Score: ${stats.avgScore.toFixed(1)}/100`);
    console.log(`   Code Quality: ${stats.avgCodeQuality?.toFixed(1) || 'N/A'}/100`);
    console.log(`   Test Coverage: ${stats.avgTestCoverage?.toFixed(1) || 'N/A'}/100`);
    console.log(`   Documentation: ${stats.avgDocumentation?.toFixed(1) || 'N/A'}/100`);
  }
  console.log('');
}

function printReviewResult(result: {
  summary: string;
  findings: Array<{
    type: string;
    severity: string;
    file?: string;
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  overallScore: number;
  codeQualityScore: number;
  testCoverageScore: number;
  documentationScore: number;
}): void {
  console.log('\n✅ AI Review Complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📝 Summary: ${result.summary}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const issues = result.findings.filter(f => f.type === 'issue');
  const suggestions = result.findings.filter(f => f.type === 'suggestion');
  const praise = result.findings.filter(f => f.type === 'praise');

  if (issues.length > 0) {
    console.log('🔴 Issues Found:\n');
    for (const issue of issues) {
      const loc = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '';
      console.log(`   ${loc ? `${loc}: ` : ''}${issue.message}`);
      if (issue.suggestion) {
        console.log(`   💡 Suggestion: ${issue.suggestion}`);
      }
    }
    console.log('');
  }

  if (suggestions.length > 0) {
    console.log('🟡 Suggestions:\n');
    for (const s of suggestions) {
      const loc = s.file ? `${s.file}${s.line ? `:${s.line}` : ''}` : '';
      console.log(`   ${loc ? `${loc}: ` : ''}${s.message}`);
    }
    console.log('');
  }

  if (praise.length > 0) {
    console.log('🟢 Well Done:\n');
    for (const p of praise) {
      console.log(`   ✓ ${p.message}`);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Scores:\n');
  const overallColor =
    result.overallScore >= 80 ? '\x1b[32m' : result.overallScore >= 60 ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`   Overall:       ${overallColor}${result.overallScore}/100${reset}`);
  console.log(`   Code Quality:  ${result.codeQualityScore}/100`);
  console.log(`   Test Coverage: ${result.testCoverageScore}/100`);
  console.log(`   Documentation: ${result.documentationScore}/100`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function printReviewDetail(review: {
  id: string;
  taskId: string | null;
  status: string;
  summary: string | null;
  findings: Array<{
    type: string;
    severity: string;
    file?: string;
    line?: number;
    message: string;
  }>;
  overallScore: number | null;
  response: string | null;
  requestedAt: Date;
  completedAt: Date | null;
}): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📋 Review: ${review.id}`);
  console.log(`   Status: ${review.status}`);
  console.log(`   Requested: ${review.requestedAt.toISOString()}`);
  if (review.completedAt) {
    console.log(`   Completed: ${review.completedAt.toISOString()}`);
  }
  if (review.overallScore !== null) {
    console.log(`   Score: ${review.overallScore}/100`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (review.summary) {
    console.log(`\n📝 ${review.summary}`);
  }
  if (review.findings.length > 0) {
    console.log('\n📌 Findings:');
    for (const f of review.findings) {
      const loc = f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '';
      console.log(`   [${f.type}] ${loc ? `${loc}: ` : ''}${f.message}`);
    }
  }
  if (review.response) {
    console.log('\n💬 Response:');
    console.log(`   ${review.response}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

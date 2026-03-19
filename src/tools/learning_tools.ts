import { DatabaseClient } from '../db/DatabaseClient.js';
import { LearningAnalysisService } from '../core/LearningAnalysis.js';
import { MemoryService } from '../core/Memory.js';
import { logger } from '../utils/logger.js';

export interface RecordOutcomeInput {
  taskId: string;
  status: 'COMPLETED' | 'FAILED' | 'RUNNING';
  taskType?: string;
  taskDescription?: string;
  errorMessage?: string;
  solutionApplied?: string;
  solutionWorked?: boolean;
  executionTimeMs?: number;
  attempts?: number;
}

export async function record_outcome(
  db: DatabaseClient,
  input: RecordOutcomeInput,
  projectId?: string
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  
  const id = await learningService.recordOutcome(
    input.taskId,
    input.status,
    {
      projectId,
      taskType: input.taskType,
      taskDescription: input.taskDescription,
      errorMessage: input.errorMessage,
      solutionApplied: input.solutionApplied,
      solutionWorked: input.solutionWorked,
      executionTimeMs: input.executionTimeMs,
      attempts: input.attempts,
    }
  );

  logger.info(`[LearningTools] Recorded outcome ${id}: ${input.status}`);
  return id;
}

export interface SuggestImprovementsInput {
  projectId?: string;
  limit?: number;
}

export async function suggest_improvements(
  db: DatabaseClient,
  input: SuggestImprovementsInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const improvements = await learningService.suggestImprovements(
    input.projectId,
    input.limit ?? 5
  );

  if (improvements.length === 0) {
    return 'No improvement suggestions at this time.';
  }

  const formatted = improvements.map((imp, i) => 
    `${i + 1}. **[${imp.errorCategory}]** (${imp.failureCount} failures)\n` +
    `   Suggestion: ${imp.suggestedImprovement}\n` +
    `   Confidence: ${Math.round(imp.confidenceScore * 100)}%`
  ).join('\n\n');

  return `## Improvement Suggestions\n\n${formatted}`;
}

export interface FindSimilarSolutionsInput {
  problem: string;
  projectId?: string;
  limit?: number;
}

export async function find_similar_solutions(
  db: DatabaseClient,
  input: FindSimilarSolutionsInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const solutions = await learningService.findSimilarSolutions(
    input.problem,
    input.projectId,
    input.limit ?? 5
  );

  if (solutions.length === 0) {
    return 'No similar solutions found.';
  }

  const formatted = solutions.map((sol, i) => 
    `${i + 1}. **Similarity: ${Math.round(sol.similarityScore * 100)}%**\n` +
    `   Problem: ${sol.taskDescription?.substring(0, 100) || 'N/A'}...\n` +
    `   Solution: ${sol.solutionApplied?.substring(0, 150) || 'N/A'}...\n` +
    `   Attempts: ${sol.attempts}, ${sol.solutionWorked ? '✅ Worked' : '❌ Failed'}`
  ).join('\n\n');

  return `## Similar Solutions Found\n\n${formatted}`;
}

export interface CreatePatternInput {
  patternType: 'success' | 'failure' | 'workaround';
  patternCategory: string;
  patternContent: string;
  patternContext?: string;
  projectId?: string;
  successRate?: number;
}

export async function create_pattern(
  db: DatabaseClient,
  input: CreatePatternInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  
  const id = await learningService.createPattern({
    patternType: input.patternType,
    patternCategory: input.patternCategory,
    patternContent: input.patternContent,
    patternContext: input.patternContext,
    projectId: input.projectId,
    successRate: input.successRate,
  });

  logger.info(`[LearningTools] Created pattern ${id}: ${input.patternType} - ${input.patternCategory}`);
  return id;
}

export interface GetSuccessPatternsInput {
  projectId?: string;
  limit?: number;
}

export async function get_success_patterns(
  db: DatabaseClient,
  input: GetSuccessPatternsInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const patterns = await learningService.getSuccessPatterns(input.limit ?? 10);

  if (patterns.length === 0) {
    return 'No success patterns recorded yet.';
  }

  const formatted = patterns.map((p, i) => 
    `${i + 1}. **[${p.patternCategory}]** - Success Rate: ${Math.round(p.successRate * 100)}%\n` +
    `   ${p.patternContent?.substring(0, 150) || 'N/A'}...\n` +
    `   Used ${p.occurrenceCount} times`
  ).join('\n\n');

  return `## Success Patterns\n\n${formatted}`;
}

export interface CreateInsightInput {
  projectId?: string;
  insightType: 'improvement' | 'warning' | 'pattern' | 'recommendation';
  title: string;
  content: string;
  evidence?: unknown[];
  priority?: number;
  confidence?: number;
  expiresInDays?: number;
}

export async function create_insight(
  db: DatabaseClient,
  input: CreateInsightInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  
  const expiresAt = input.expiresInDays 
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const id = await learningService.createInsight({
    projectId: input.projectId,
    insightType: input.insightType,
    title: input.title,
    content: input.content,
    evidence: input.evidence,
    priority: input.priority,
    confidence: input.confidence,
    expiresAt,
  });

  logger.info(`[LearningTools] Created insight ${id}: ${input.title}`);
  return id;
}

export interface GetInsightsInput {
  projectId?: string;
  limit?: number;
  includeApplied?: boolean;
}

export async function get_insights(
  db: DatabaseClient,
  input: GetInsightsInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const insights = await learningService.getRecentInsights(
    input.projectId,
    input.limit ?? 10,
    input.includeApplied
  );

  if (insights.length === 0) {
    return 'No insights available.';
  }

  const formatted = insights.map((ins, i) => {
    const emoji = ins.insightType === 'warning' ? '⚠️' 
      : ins.insightType === 'improvement' ? '💡' 
      : ins.insightType === 'recommendation' ? '📋' : '🔍';
    const status = ins.isApplied ? '✅ Applied' : '';
    
    return `${i + 1}. ${emoji} **[${ins.insightType.toUpperCase()}]** ${ins.title} ${status}\n` +
      `   ${ins.content}\n` +
      `   Priority: ${ins.priority}/10, Confidence: ${Math.round(ins.confidence * 100)}%`;
  }).join('\n\n');

  return `## Learning Insights\n\n${formatted}`;
}

export interface ApplyInsightInput {
  insightId: string;
}

export async function apply_insight(
  db: DatabaseClient,
  input: ApplyInsightInput
): Promise<void> {
  const learningService = new LearningAnalysisService(db);
  await learningService.markInsightApplied(input.insightId);
  logger.info(`[LearningTools] Applied insight ${input.insightId}`);
}

export async function auto_generate_insights(
  db: DatabaseClient,
  projectId?: string
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const ids = await learningService.autoGenerateInsights();
  
  if (ids.length === 0) {
    return 'No new insights generated.';
  }

  return `Generated ${ids.length} new insights.`;
}

export async function get_learning_stats(
  db: DatabaseClient,
  days: number = 7
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const failureStats = await learningService.getFailureStats(days);
  const patterns = await learningService.getSuccessPatterns(10);

  return `## Learning Statistics (Last ${days} days)

### Failure Analysis
- Total Failures: ${failureStats.totalFailures}
- Average Recovery Time: ${Math.round(failureStats.avgRecoveryTimeMs / 1000)}s
- By Category: ${JSON.stringify(failureStats.byCategory)}

### Success Patterns
- Patterns Recorded: ${patterns.length}
- Top Pattern: ${patterns[0]?.patternCategory || 'N/A'} (${Math.round((patterns[0]?.successRate || 0) * 100)}% success rate)`;
}

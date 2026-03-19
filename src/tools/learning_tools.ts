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

  const id = await learningService.recordOutcome(input.taskId, input.status, {
    projectId,
    taskType: input.taskType,
    taskDescription: input.taskDescription,
    errorMessage: input.errorMessage,
    solutionApplied: input.solutionApplied,
    solutionWorked: input.solutionWorked,
    executionTimeMs: input.executionTimeMs,
    attempts: input.attempts,
  });

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
  const improvements = await learningService.suggestImprovements(input.projectId, input.limit ?? 5);

  if (improvements.length === 0) {
    return 'No improvement suggestions at this time.';
  }

  const formatted = improvements
    .map(
      (imp, i) =>
        `${i + 1}. **[${imp.errorCategory}]** (${imp.failureCount} failures)\n` +
        `   Suggestion: ${imp.suggestedImprovement}\n` +
        `   Confidence: ${Math.round(imp.confidenceScore * 100)}%`
    )
    .join('\n\n');

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

  const formatted = solutions
    .map(
      (sol, i) =>
        `${i + 1}. **Similarity: ${Math.round(sol.similarityScore * 100)}%**\n` +
        `   Problem: ${sol.taskDescription?.substring(0, 100) || 'N/A'}...\n` +
        `   Solution: ${sol.solutionApplied?.substring(0, 150) || 'N/A'}...\n` +
        `   Attempts: ${sol.attempts}, ${sol.solutionWorked ? '✅ Worked' : '❌ Failed'}`
    )
    .join('\n\n');

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

  logger.info(
    `[LearningTools] Created pattern ${id}: ${input.patternType} - ${input.patternCategory}`
  );
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

  const formatted = patterns
    .map(
      (p, i) =>
        `${i + 1}. **[${p.patternCategory}]** - Success Rate: ${Math.round(p.successRate * 100)}%\n` +
        `   ${p.patternContent?.substring(0, 150) || 'N/A'}...\n` +
        `   Used ${p.occurrenceCount} times`
    )
    .join('\n\n');

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

export async function get_insights(db: DatabaseClient, input: GetInsightsInput): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const insights = await learningService.getRecentInsights(
    input.projectId,
    input.limit ?? 10,
    input.includeApplied
  );

  if (insights.length === 0) {
    return 'No insights available.';
  }

  const formatted = insights
    .map((ins, i) => {
      const emoji =
        ins.insightType === 'warning'
          ? '⚠️'
          : ins.insightType === 'improvement'
            ? '💡'
            : ins.insightType === 'recommendation'
              ? '📋'
              : '🔍';
      const status = ins.isApplied ? '✅ Applied' : '';

      return (
        `${i + 1}. ${emoji} **[${ins.insightType.toUpperCase()}]** ${ins.title} ${status}\n` +
        `   ${ins.content}\n` +
        `   Priority: ${ins.priority}/10, Confidence: ${Math.round(ins.confidence * 100)}%`
      );
    })
    .join('\n\n');

  return `## Learning Insights\n\n${formatted}`;
}

export interface ApplyInsightInput {
  insightId: string;
}

export async function apply_insight(db: DatabaseClient, input: ApplyInsightInput): Promise<void> {
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

export async function get_learning_stats(db: DatabaseClient, days: number = 7): Promise<string> {
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

// ============================================================
// SKILL TOOLS
// ============================================================

import { SkillSystem } from '../core/SkillSystem.js';
import { SkillBuilder } from '../services/SkillBuilder.js';

export interface SearchSkillsInput {
  query: string;
  projectId?: string;
}

export async function search_skills(db: DatabaseClient, input: SearchSkillsInput): Promise<string> {
  const skillSystem = new SkillSystem();
  skillSystem.setDatabaseClient(db);

  const results = await skillSystem.searchSkills(input.query);

  if (results.length === 0) {
    return `No skills found matching "${input.query}".`;
  }

  const formatted = results
    .slice(0, 10)
    .map(
      (skill, i) =>
        `${i + 1}. **${skill.name}** (v${skill.version})\n` +
        `   ${skill.description || 'No description'}\n` +
        `   Safety: ${skill.safety_score}/100 | Used: ${skill.use_count}x\n` +
        `   Source: ${skill.source} | Tags: ${skill.tags.join(', ') || 'none'}`
    )
    .join('\n\n');

  return `## Skills Found (${results.length})\n\n${formatted}`;
}

export interface ExecuteSkillInput {
  name: string;
  input: unknown;
  projectId?: string;
}

export async function execute_skill(db: DatabaseClient, input: ExecuteSkillInput): Promise<string> {
  const skillSystem = new SkillSystem();
  skillSystem.setDatabaseClient(db);

  const context = {
    skillId: '',
    skillName: input.name,
    projectId: input.projectId,
    timestamp: new Date(),
  };

  const result = await skillSystem.executeSkill(input.name, input.input, context);

  if (!result.success) {
    return `❌ Skill execution failed: ${result.error}`;
  }

  return `✅ Skill "${input.name}" executed successfully.\n\nOutput: ${JSON.stringify(result.output, null, 2)}`;
}

export interface BuildSkillInput {
  name: string;
  purpose: string;
  useCases?: string[];
  capabilities?: string[];
  autoApprove?: boolean;
}

export async function build_skill(db: DatabaseClient, input: BuildSkillInput): Promise<string> {
  const skillBuilder = new SkillBuilder();
  skillBuilder.setDatabaseClient(db);

  const result = await skillBuilder.buildSkill({
    name: input.name,
    purpose: input.purpose,
    useCases: input.useCases,
    requiredCapabilities: input.capabilities,
  });

  if (!result.success) {
    return `❌ Skill build failed: ${result.error}`;
  }

  return (
    `✅ Skill "${input.name}" built successfully!\n\n` +
    `ID: ${result.skillId}\n` +
    `Quality Score: ${result.qualityScore}/100\n` +
    `Status: pending${input.autoApprove ? ' (auto-approved)' : ''}`
  );
}

export interface ListSkillsInput {
  projectId?: string;
  limit?: number;
}

export async function list_skills(
  db: DatabaseClient,
  input: ListSkillsInput = {}
): Promise<string> {
  const skillSystem = new SkillSystem();
  skillSystem.setDatabaseClient(db);

  const skills = await skillSystem.listSkills();

  if (skills.length === 0) {
    return 'No skills installed. Use `build_skill` to create one or search ClawHub.';
  }

  const formatted = skills
    .slice(0, input.limit ?? 20)
    .map(
      (skill, i) =>
        `${i + 1}. **${skill.name}** (v${skill.version})\n` +
        `   ${skill.description || 'No description'}\n` +
        `   Used: ${skill.use_count}x | Rating: ${skill.rating || 'N/A'}`
    )
    .join('\n\n');

  return `## Installed Skills (${skills.length})\n\n${formatted}`;
}

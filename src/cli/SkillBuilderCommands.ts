import { skillBuilder, type SkillBuildInput } from '../services/SkillBuilder.js';

export async function buildSkillCommand(
  name: string,
  purpose: string,
  options?: {
    useCases?: string[];
    capabilities?: string[];
    permissions?: string[];
    autoApprove?: boolean;
  }
): Promise<void> {
  console.log('\n🛠️  Building skill...\n');

  const input: SkillBuildInput = {
    name,
    purpose,
    useCases: options?.useCases,
    requiredCapabilities: options?.capabilities,
    suggestedPermissions: options?.permissions,
  };

  const result = await skillBuilder.buildSkill(input);

  console.log('='.repeat(60));
  console.log(`🛠️  Skill Build: ${name}`);
  console.log('='.repeat(60));

  if (!result.success) {
    console.log(`\n❌ Build failed: ${result.error}`);
    return;
  }

  const qualityIcon =
    result.qualityScore && result.qualityScore >= 80
      ? '🟢'
      : result.qualityScore && result.qualityScore >= 50
        ? '🟡'
        : '🔴';

  console.log(`\n✅ Skill built successfully!`);
  console.log(`   ID: ${result.skillId}`);
  console.log(`   Quality Score: ${qualityIcon} ${result.qualityScore}/100`);
  console.log(`   Source: internally-built`);

  if (result.skill) {
    console.log(`\n📝 Generated Skill Spec:`);
    console.log(`   Name: ${result.skill.name}`);
    console.log(`   Description: ${result.skill.description}`);
    console.log(`   Triggers: ${result.skill.trigger.join(', ')}`);
    console.log(`   Permissions: ${result.skill.permissions.join(', ')}`);
    console.log(`   Tags: ${result.skill.tags.join(', ')}`);
  }

  if (!options?.autoApprove) {
    console.log('\n⏳ Skill saved to database with status: pending');
    console.log('   Use: nezha skills approve <id> to approve for use\n');
  } else {
    console.log('\n✅ Skill auto-approved for use\n');
  }
}

export async function listInternalSkillsCommand(): Promise<void> {
  console.log('\n📦 Internally-built Skills:\n');

  const skills = await skillBuilder.listInternallyBuiltSkills();

  if (skills.length === 0) {
    console.log('   No internally-built skills yet.');
    console.log('   Use: nezha skills build <name> <purpose>\n');
    return;
  }

  for (const skill of skills) {
    console.log(`  🛠️  ${skill.name}`);
    console.log(`     ${skill.description || 'No description'}`);
    if (skill.metadata) {
      console.log(
        `     Built: ${(skill.metadata as Record<string, unknown>).builtAt || 'unknown'}`
      );
      console.log(`     By: ${(skill.metadata as Record<string, unknown>).builtBy || 'nezha-ai'}`);
    }
    console.log();
  }
}

export async function improveSkillCommand(skillId: string, improvement: string): Promise<void> {
  console.log(`\n🔧 Improving skill ${skillId}...\n`);

  const result = await skillBuilder.improveSkill(skillId, improvement);

  if (!result.success) {
    console.log(`❌ Improvement failed: ${result.error}\n`);
    return;
  }

  console.log(`✅ Skill improved successfully!`);
  console.log(`   New Quality Score: ${result.qualityScore}/100\n`);
}

export async function deprecateSkillCommand(skillId: string, reason: string): Promise<void> {
  console.log(`\n⚠️  Deprecating skill ${skillId}...\n`);

  const success = await skillBuilder.deprecateSkill(skillId, reason);

  if (success) {
    console.log(`✅ Skill deprecated successfully.`);
    console.log(`   Reason: ${reason}\n`);
  } else {
    console.log(`❌ Failed to deprecate skill.\n`);
  }
}

export async function transferMaintainerCommand(
  skillId: string,
  newMaintainer: string
): Promise<void> {
  console.log(`\n👤 Transferring maintainer for ${skillId}...\n`);

  const success = await skillBuilder.updateSkillMaintainer(skillId, newMaintainer);

  if (success) {
    console.log(`✅ Maintainer updated successfully.`);
    console.log(`   New Maintainer: ${newMaintainer}\n`);
  } else {
    console.log(`❌ Failed to update maintainer.\n`);
  }
}

export async function suggestSkillsCommand(): Promise<void> {
  console.log('\n💡 Skill Suggestions (based on recent patterns):\n');

  console.log('Based on common development patterns, here are suggested skills to build:\n');

  const suggestions = [
    {
      name: 'code-review',
      purpose: 'Performs automated code review with best practices and linting',
      tags: ['code-quality', 'review'],
    },
    {
      name: 'test-generator',
      purpose: 'Generates unit tests based on code changes',
      tags: ['testing', 'automation'],
    },
    {
      name: 'api-doc-generator',
      purpose: 'Generates API documentation from code',
      tags: ['documentation', 'api'],
    },
    {
      name: 'git-commit-helper',
      purpose: 'Helps write meaningful git commit messages',
      tags: ['git', 'automation'],
    },
    {
      name: 'security-scanner',
      purpose: 'Scans code for common security vulnerabilities',
      tags: ['security', 'analysis'],
    },
    {
      name: 'performance-analyzer',
      purpose: 'Analyzes code for performance bottlenecks',
      tags: ['performance', 'analysis'],
    },
  ];

  for (const suggestion of suggestions) {
    console.log(`  📝 ${suggestion.name}`);
    console.log(`     Purpose: ${suggestion.purpose}`);
    console.log(`     Tags: ${suggestion.tags.join(', ')}`);
    console.log(`     Build: nezha skills build ${suggestion.name} "${suggestion.purpose}"\n`);
  }
}

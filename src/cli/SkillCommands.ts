import { clawHubClient, type SearchOptions } from '../services/ClawHubClient.js';
import type { ClawHubSkill, SkillReviewResult } from '../services/SkillReviewer.js';
import readline from 'readline';

export interface SkillApprovalRequest {
  skill: ClawHubSkill;
  review: SkillReviewResult;
}

export class SkillApprovalWorkflow {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async prompt(question: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(question, (answer: string) => {
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  async requestApproval(skill: ClawHubSkill, review: SkillReviewResult): Promise<boolean> {
    console.log('\n' + '='.repeat(60));
    console.log(`📦 SKILL: ${skill.name}`);
    console.log('='.repeat(60));
    console.log(`Description: ${skill.description}`);
    console.log(`Author: ${skill.author} ${skill.verified ? '✓ Verified' : '(unverified)'}`);
    console.log(
      `Version: ${skill.version} | Downloads: ${skill.downloads} | Rating: ${skill.rating}`
    );
    console.log(`Tags: ${skill.tags.join(', ') || 'none'}`);
    console.log(`Safety Score: ${review.score}/100`);

    if (review.codeAnalysis && review.codeAnalysis.permissions.length > 0) {
      console.log('\n🔒 Required Permissions:');
      for (const perm of review.codeAnalysis.permissions) {
        console.log(`   • ${perm}`);
      }
    }

    if (review.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of review.warnings) {
        console.log(`   - ${warning}`);
      }
    }

    if (review.issues.length > 0) {
      console.log('\n❌ BLOCKING ISSUES:');
      for (const issue of review.issues) {
        console.log(`   - ${issue}`);
      }
    }

    console.log('\n' + '-'.repeat(60));

    if (!review.isSafe) {
      console.log('❌ SKILL BLOCKED: Safety score too low or has blocking issues.');
      console.log('   This skill will NOT be installed.');
      this.rl.close();
      return false;
    }

    const answer = await this.prompt('Do you want to install this skill? [y/N]: ');

    return answer === 'y' || answer === 'yes';
  }

  async requestBulkApproval(
    skills: SkillApprovalRequest[]
  ): Promise<{ approved: ClawHubSkill[]; rejected: ClawHubSkill[] }> {
    console.log('\n' + '#'.repeat(60));
    console.log('# CLAWHUB SKILL REVIEW - BULK APPROVAL');
    console.log('#'.repeat(60));
    console.log(`\nFound ${skills.length} skill(s). Reviewing safety...`);

    const approved: ClawHubSkill[] = [];
    const rejected: ClawHubSkill[] = [];

    const safeSkills = skills.filter(s => s.review.isSafe);
    const unsafeSkills = skills.filter(s => !s.review.isSafe);

    if (unsafeSkills.length > 0) {
      console.log(`\n🛡️  BLOCKED ${unsafeSkills.length} unsafe skill(s):`);
      for (const { skill, review } of unsafeSkills) {
        console.log(`   ✗ ${skill.name} - Score: ${review.score}/100`);
        if (review.issues.length > 0) {
          console.log(`     Issues: ${review.issues.join(', ')}`);
        }
      }
    }

    if (safeSkills.length > 0) {
      console.log(`\n✅ ${safeSkills.length} safe skill(s) ready for review:`);
      for (const { skill, review } of safeSkills) {
        console.log(`\n   [${safeSkills.indexOf({ skill, review }) + 1}] ${skill.name}`);
        console.log(`       ${skill.description}`);
        console.log(
          `       Author: ${skill.author} | Rating: ${skill.rating} | Score: ${review.score}/100`
        );
        if (review.warnings.length > 0) {
          console.log(`       Warnings: ${review.warnings.length}`);
        }
      }

      console.log('\n' + '-'.repeat(60));
      const answer = await this.prompt(`Install all ${safeSkills.length} safe skills? [y/N/all]: `);

      if (answer === 'y' || answer === 'yes') {
        approved.push(...safeSkills.map(s => s.skill));
      } else if (answer === 'all') {
        for (const { skill, review } of safeSkills) {
          const individual = await this.requestApproval(skill, review);
          if (individual) {
            approved.push(skill);
          } else {
            rejected.push(skill);
          }
        }
      } else {
        rejected.push(...safeSkills.map(s => s.skill));
      }
    }

    this.rl.close();

    return { approved, rejected };
  }

  close(): void {
    this.rl.close();
  }
}

export async function searchAndPreviewSkills(query?: string, tags?: string[]): Promise<void> {
  const options: SearchOptions = { query, tags, limit: 10 };

  console.log(`\n🔍 Searching ClawHub for: ${query || 'all skills'}...`);

  const skills = await clawHubClient.searchSkills(options);

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

    console.log(`${i + 1}. ${status} ${skill.name} ${skill.verified ? '✓' : ''}`);
    console.log(`   ${skill.description}`);
    console.log(
      `   Author: ${skill.author} | Downloads: ${skill.downloads} | Rating: ${skill.rating}`
    );
    console.log(`   Safety: ${scoreColor}${review.score}/100${reset}`);

    if (review.warnings.length > 0) {
      console.log(`   ⚠ Warnings: ${review.warnings.length}`);
    }

    if (!review.isSafe) {
      console.log(`   ❌ BLOCKED: ${review.issues.join(', ')}`);
    }

    console.log();
  }
}

export async function installSkillWithApproval(skillName: string): Promise<boolean> {
  const skills = await clawHubClient.searchSkills({ query: skillName, limit: 1 });

  if (skills.length === 0) {
    console.log(`Skill not found: ${skillName}`);
    return false;
  }

  const skill = skills[0];
  if (!skill) {
    console.log(`Skill not found: ${skillName}`);
    return false;
  }

  const review = await clawHubClient.reviewSkill(skill);

  const workflow = new SkillApprovalWorkflow();

  const approved = await workflow.requestApproval(skill, review);

  if (approved) {
    return await clawHubClient.installSkill(skill);
  }

  console.log('Installation cancelled.');
  return false;
}

export async function browseSkillsWithApproval(
  query?: string,
  tags?: string[],
  limit = 5
): Promise<void> {
  const options: SearchOptions = { query, tags, limit };
  const skills = await clawHubClient.searchSkills(options);

  if (skills.length === 0) {
    console.log('No skills found.');
    return;
  }

  const reviews = await clawHubClient.reviewSkills(skills);

  const requests: SkillApprovalRequest[] = [];
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const review = reviews[i];
    if (skill && review) {
      requests.push({ skill, review });
    }
  }

  const workflow = new SkillApprovalWorkflow();
  const { approved, rejected } = await workflow.requestBulkApproval(requests);

  if (approved.length > 0) {
    console.log(`\n📥 Installing ${approved.length} skill(s)...`);

    for (const skill of approved) {
      await clawHubClient.installSkill(skill);
    }
  }

  if (rejected.length > 0) {
    console.log(`\n⏭️  Skipped ${rejected.length} skill(s).`);
  }

  console.log('\n✅ Done!');
}

export function listInstalledSkills(): void {
  const installed = clawHubClient.listInstalledSkills();

  if (installed.length === 0) {
    console.log('No skills installed.');
    return;
  }

  console.log('\n📦 Installed Skills:\n');

  for (const skill of installed) {
    const statusIcon =
      skill.scanStatus === 'clean' ? '✓' : skill.scanStatus === 'suspicious' ? '⚠' : '✗';
    console.log(`  ${statusIcon} ${skill.name} v${skill.version}`);
    console.log(`     Author: ${skill.author}`);
    if (skill.scanStatus) {
      console.log(`     Scan: ${skill.scanStatus}`);
    }
    console.log();
  }
}

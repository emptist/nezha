#!/usr/bin/env node

import { DatabaseClient } from '../src/db/DatabaseClient.js';
import { Config } from '../src/config/Config.js';
import { SkillReviewer } from '../src/services/SkillReviewer.js';

async function batchUpdateSkills() {
  console.log('🔄 Starting batch safety scan for skills with score=0...\n');

  const config = Config.getInstance();
  const db = new DatabaseClient(config);

  const reviewer = new SkillReviewer();

  const result = await db.query<{
    id: string;
    name: string;
    description: string;
    instructions: string;
    category: string;
  }>(`SELECT id, name, description, instructions, category FROM skills WHERE safety_score = 0`);

  const skills = result.rows;
  console.log(`Found ${skills.length} skills with safety_score = 0\n`);

  let updated = 0;
  let passed = 0;
  let failed = 0;

  for (const skill of skills) {
    try {
      const skillContent = [skill.instructions, skill.description, skill.category]
        .filter(Boolean)
        .join('\n\n');

      const fakeSkill = {
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        author: 'unknown',
        version: '1.0.0',
        downloads: 0,
        rating: 0,
        tags: [] as string[],
        repository: '',
        verified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const reviewResult = await reviewer.reviewSkill(fakeSkill, skillContent);

      const scanStatus = reviewResult.isSafe
        ? 'clean'
        : reviewResult.issues.length > 0
          ? 'suspicious'
          : 'reviewed';

      await db.query(
        `UPDATE skills SET safety_score = $1, scan_status = $2, updated_at = NOW() WHERE id = $3`,
        [reviewResult.score, scanStatus, skill.id]
      );

      if (reviewResult.score >= 70) {
        passed++;
      } else {
        failed++;
      }
      updated++;

      if (updated % 50 === 0) {
        console.log(
          `  Progress: ${updated}/${skills.length} processed, ${passed} passed, ${failed} failed`
        );
      }
    } catch (error) {
      console.error(`  Error processing skill ${skill.name}:`, error);
    }
  }

  console.log(`\n✅ Batch update complete!`);
  console.log(`   Total processed: ${updated}`);
  console.log(`   Passed (>=70): ${passed}`);
  console.log(`   Failed (<70): ${failed}`);

  await db.close();
}

batchUpdateSkills().catch(console.error);

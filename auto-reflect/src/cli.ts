#!/usr/bin/env node
import { config } from 'dotenv';
config();

import { AtmReflect } from './AtmReflect.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Trae Reflect - Standalone reflection tool for Trae Editor AI

Usage: atmReflect <text with markers>

Markers:
  [LEARN] insight: <learning> context: <optional context>
  [PROMPT_UPDATE] current: <text> suggested: <text> reason: <why>
  [ISSUE] title: <title> description: <desc> type: <bug|improvement> severity: <level>
  [TASK] title: <title> description: <desc> priority: <1-10> type: <implementation|review|research>
  [ANNOUNCE] message: <text> priority: <low|normal|high|critical> to: <agent-id>
  [SCHEDULE] title: <title> cron: <cron-expr> description: <desc> priority: <1-10>

Commands:
  atmReflect "<text>"           Parse and save reflection markers
  atmReflect --check            Check for pending work
  atmReflect --learnings        Show recent learnings

Examples:
  atmReflect "[LEARN] insight: Always check for pending work before stopping"
  atmReflect "[ISSUE] title: Bug in parser type: bug severity: high"
  atmReflect "[TASK] title: Fix parser bug priority: 8 type: implementation"
  atmReflect "[ANNOUNCE] message: DLQ has 43 items priority: high"
  atmReflect "[SCHEDULE] title: Daily cleanup cron: '0 2 * * *' description: Clean old tasks"
  atmReflect --check
`);
    process.exit(0);
  }

  const atmReflect = new AtmReflect();

  try {
    await atmReflect.connect();

    if (args[0] === '--check') {
      const work = await atmReflect.checkPendingWork();
      console.log('\n📊 Pending Work Check\n');
      console.log(`   Tasks:    ${work.tasks}`);
      console.log(`   DLQ:      ${work.dlq}`);
      console.log(`   Issues:   ${work.issues}`);
      console.log(`   Has Work: ${work.hasWork ? 'YES' : 'NO'}`);
      console.log('');
      process.exit(work.hasWork ? 0 : 1);
    }

    if (args[0] === '--learnings') {
      const learnings = await atmReflect.getRecentLearnings(10);
      console.log('\n📚 Recent Learnings\n');
      for (const l of learnings) {
        console.log(`   [${l.source}] ${l.content.substring(0, 60)}...`);
      }
      console.log('');
      process.exit(0);
    }

    if (args[0] === '--post-commit') {
      console.log('\n🔄 Post-Commit Check\n');
      await atmReflect.checkPendingTasks();
      process.exit(0);
    }

    const text = args.slice(1).join(' ');
    const result = await atmReflect.reflect(text);

    if (result.total === 0) {
      console.log('No reflection markers found in text.');
    } else {
      console.log(`\n✓ Parsed ${result.total} reflection item(s)`);
      console.log(`   Learnings: ${result.learnings}`);
      console.log(`   Prompt Updates: ${result.promptUpdates}`);
      console.log(`   Issues: ${result.issues}`);
      console.log(`   Tasks: ${result.tasks}`);
      console.log(`   Announces: ${result.announces}`);
      console.log(`   Schedules: ${result.schedules}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await atmReflect.disconnect();
  }
}

main();

#!/usr/bin/env node
import { config } from 'dotenv';
config();

import { AutonomousReflect } from './AutonomousReflect.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Trae Reflect - Standalone reflection tool for Trae Editor AI

Usage: areflect <text with markers>

Markers:
  [LEARN] insight: <learning> context: <optional context>
  [PROMPT_UPDATE] current: <text> suggested: <text> reason: <why>
  [ISSUE] title: <title> description: <desc> type: <bug|improvement> severity: <level>
  [ISSUE_RESOLVE] id: <uuid> resolution: <text>
  [ISSUE_COMMENT] id: <uuid> comment: <text> internal: <true|false>
  [TASK] title: <title> description: <desc> priority: <1-10> type: <implementation|review|research>
  [TASK_COMPLETE] id: <uuid> result: <optional result>
  [ANNOUNCE] message: <text> priority: <low|normal|high|critical> to: <agent-id>
  [SCHEDULE] title: <title> cron: <cron-expr> description: <desc> priority: <1-10>

Commands:
  areflect "<text>"           Parse and save reflection markers
  areflect --check            Check for pending work
  areflect --learnings        Show recent learnings

Examples:
  areflect "[LEARN] insight: Always check for pending work before stopping"
  areflect "[ISSUE] title: Bug in parser type: bug severity: high"
  areflect "[TASK] title: Fix parser bug priority: 8 type: implementation"
  areflect "[ANNOUNCE] message: DLQ has 43 items priority: high"
  areflect "[SCHEDULE] title: Daily cleanup cron: '0 2 * * *' description: Clean old tasks"
  areflect --check
`);
    process.exit(0);
  }

  const areflect = new AutonomousReflect();

  try {
    await areflect.connect();

    if (args[0] === '--check') {
      const work = await areflect.checkPendingWork();
      console.log('\n📊 Pending Work Check\n');
      console.log(`   Tasks:    ${work.tasks}`);
      console.log(`   DLQ:      ${work.dlq}`);
      console.log(`   Issues:   ${work.issues}`);
      console.log(`   Has Work: ${work.hasWork ? 'YES' : 'NO'}`);
      console.log('');
      process.exit(work.hasWork ? 0 : 1);
    }

    if (args[0] === '--learnings') {
      const learnings = await areflect.getRecentLearnings(10);
      console.log('\n📚 Recent Learnings\n');
      for (const l of learnings) {
        console.log(`   [${l.source}] ${l.content.substring(0, 60)}...`);
      }
      console.log('');
      process.exit(0);
    }

    if (args[0] === '--post-commit') {
      console.log('\n🔄 Post-Commit Check\n');
      await areflect.checkPendingTasks();
      process.exit(0);
    }

    const text = args.join(' ');

    if (!text.toLowerCase().includes('areflect')) {
      console.error('Error: areflect keyword is required. Usage: areflect "[MARKER]..."');
      process.exit(1);
    }

    const result = await areflect.reflect(text);

    if (result.total === 0) {
      console.log('No reflection markers found in text.');
    } else {
      console.log(`\n✓ Parsed ${result.total} reflection item(s)`);
      console.log(`   Learnings: ${result.learnings}`);
      console.log(`   Prompt Updates: ${result.promptUpdates}`);
      console.log(`   Issues Created: ${result.issues}`);
      console.log(`   Issues Resolved: ${result.issuesResolved}`);
      console.log(`   Issue Comments: ${result.issueComments}`);
      console.log(`   Tasks Created: ${result.tasks}`);
      console.log(`   Tasks Completed: ${result.tasksCompleted}`);
      console.log(`   Announces: ${result.announces}`);
      console.log(`   Schedules: ${result.schedules}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await areflect.disconnect();
  }
}

main();

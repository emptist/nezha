import { config } from 'dotenv';
config();

import { TraeReflect } from './TraeReflect.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Trae Reflect - Standalone reflection tool for Trae Editor AI

Usage: trae-reflect <text with markers>

Markers:
  [LEARN] insight: <learning> context: <optional context>
  [PROMPT_UPDATE] current: <text> suggested: <text> reason: <why>
  [ISSUE] title: <title> description: <desc> type: <bug|improvement> severity: <level>

Commands:
  trae-reflect "<text>"           Parse and save reflection markers
  trae-reflect --check            Check for pending work
  trae-reflect --learnings        Show recent learnings

Examples:
  trae-reflect "[LEARN] insight: Always check for pending work before stopping"
  trae-reflect "[ISSUE] title: Bug in parser type: bug severity: high"
  trae-reflect --check
`);
    process.exit(0);
  }

  const reflect = new TraeReflect();

  try {
    await reflect.connect();

    if (args[0] === '--check') {
      const work = await reflect.checkPendingWork();
      console.log('\n📊 Pending Work Check\n');
      console.log(`   Tasks:    ${work.tasks}`);
      console.log(`   DLQ:      ${work.dlq}`);
      console.log(`   Issues:   ${work.issues}`);
      console.log(`   Has Work: ${work.hasWork ? 'YES' : 'NO'}`);
      console.log('');
      process.exit(work.hasWork ? 0 : 1);
    }

    if (args[0] === '--learnings') {
      const learnings = await reflect.getRecentLearnings(10);
      console.log('\n📚 Recent Learnings\n');
      for (const l of learnings) {
        console.log(`   [${l.source}] ${l.content.substring(0, 60)}...`);
      }
      console.log('');
      process.exit(0);
    }

    const text = args.join(' ');
    const result = await reflect.reflect(text);

    if (result.total === 0) {
      console.log('No reflection markers found in text.');
    } else {
      console.log(`\n✓ Parsed ${result.total} reflection item(s)`);
      console.log(`   Learnings: ${result.learnings}`);
      console.log(`   Prompt Updates: ${result.promptUpdates}`);
      console.log(`   Issues: ${result.issues}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await reflect.disconnect();
  }
}

main();

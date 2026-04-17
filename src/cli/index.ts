#!/usr/bin/env node
// Minimal Nezha CLI - Database operations only, no daemon/server

import { config } from 'dotenv';
config({ quiet: true });

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { IssueCommands } from './IssueCommands.js';
import { TaskCommands } from './TaskCommands.js';
import { MeetingCommands, MeetingDbCommands } from './MeetingCommands.js';
import { BroadcastCommands } from './BroadcastCommands.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import { databaseSkillLoader } from '../services/DatabaseSkillLoader.js';
import { skillSystem } from '../core/SkillSystem.js';
import {
  buildSkillCommand,
  listInternalSkillsCommand,
  improveSkillCommand,
  deprecateSkillCommand,
  suggestSkillsCommand,
} from './SkillBuilderCommands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = join(__dirname, '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const VERSION = pkg.version;

const args = process.argv.slice(2);
const command = args[0];

const COMMANDS = `
Nezha CLI - Coordination Layer

Usage: nezha <command> [options]

Core Commands:
  task-add <title> [desc] Add a task
  tasks [--status]      List tasks
  issue-add <title>    Add an issue
  issue-list           List issues
  meeting discuss <t> <d>  Create AI discussion

Skill Commands:
  skill list            List all approved skills
  skill show <name>     Show skill details
  skill search <query> Search skills
  skill build <name> <purpose>  Build new skill

Other Commands (legacy, may be removed):
  areflect <text>       
  learn <insight>      
  broadcast <msg>      (no restrictions, AIs can ignore)

Options:
  --status <status>     Filter by status
  --priority <n>      Set priority (0-100)
  --severity <s>       Set severity (low/medium/high/critical)
  --json             Output as JSON

Examples:
  nezha areflect "[LEARN] insight: ..."
  nezha skill list
  nezha skill show git-workflow
  nezha skill search code
  nezha skill build my-skill "Does X task"
  nezha task-add "Fix bug" "description" --priority 8

For more info: nezha help <command>
`;

async function getDb(): Promise<DatabaseClient> {
  const config = Config.getInstance();
  return new DatabaseClient(config);
}

async function main() {
  if (!command || command === 'help' || command === '--help' || args.length === 0) {
    console.log(COMMANDS);
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(`nezha v${VERSION}`);
    return;
  }

  const db = await getDb();

  switch (command) {
    case 'task-add': {
      const title = args[1];
      const descIndex = args.indexOf('--description');
      const description = descIndex !== -1 && args[descIndex + 1] ? args[descIndex + 1] : '';
      const priorityIndex = args.indexOf('--priority');
      const priority = priorityIndex !== -1 ? parseInt(args[priorityIndex + 1] || '5', 10) : 5;
      if (!title) {
        console.log('Usage: nezha task-add "title" "description" --priority 5');
        return;
      }
      const taskCmd = new TaskCommands(db);
      const result = await taskCmd.create(title, description || '', { priority });
      console.log(`Created task: ${result}`);
      break;
    }
    case 'tasks': {
      const statusIndex = args.indexOf('--status');
      const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
      const taskCmd = new TaskCommands(db);
      await taskCmd.list({ status });
      break;
    }
    case 'issue-add': {
      const title = args[1];
      if (!title) {
        console.log('Usage: nezha issue-add "title" [--severity critical]');
        return;
      }
      const severityIndex = args.indexOf('--severity');
      const severity = severityIndex !== -1 ? args[severityIndex + 1] : 'medium';
      const issueCmd = new IssueCommands(db);
      const result = await issueCmd.create(title, '', { severity });
      console.log(`Created issue: ${result}`);
      break;
    }
    case 'issue-list': {
      const issueCmd = new IssueCommands(db);
      await issueCmd.list();
      break;
    }
    case 'meeting': {
      const subcmd = args[1];
      const meetingCmd = new MeetingCommands({ db });
      const meetingDbCmd = new MeetingDbCommands(db);

      if (subcmd === 'discuss') {
        const title = args[2];
        const description = args.slice(3).join(' ') || '';
        if (!title) {
          console.log('Usage: nezha meeting discuss "title" "description"');
          return;
        }
        await meetingCmd.createDiscussion(title, description);
        console.log(`Created meeting: ${title}`);
      } else if (subcmd === 'list') {
        await meetingDbCmd.list({});
      } else if (subcmd === 'show') {
        const meetingId = args[2];
        if (!meetingId) {
          console.log('Usage: nezha meeting show <id>');
          return;
        }
        await meetingDbCmd.show(meetingId);
      } else {
        console.log('Usage: nezha meeting <discuss|list|show>');
      }
      break;
    }
    case 'announce': {
      const message = args.slice(1).join(' ');
      if (!message) {
        console.log('Usage: nezha announce "message" [--priority low|normal|high|critical]');
        return;
      }
      const priorityIndex = args.indexOf('--priority');
      const priority = priorityIndex !== -1 ? (args[priorityIndex + 1] as any) : 'normal';
      const broadcastCmd = new BroadcastCommands(db);
      await broadcastCmd.send(message, undefined, priority);
      break;
    }
    case 'agents': {
      if (args[1] === 'id') {
        const identity = await AgentIdentityService.getResolvedIdentity();
        console.log(identity.id);
      }
      break;
    }
    case 'validate-commit': {
      const msgFile = args[1];
      if (!msgFile) {
        console.log('Error: commit message file required');
        process.exit(1);
      }
      const fs = await import('fs');
      const msg = fs.readFileSync(msgFile, 'utf-8');
      if (!msg.includes('[task:') && !msg.includes('[issue:') && !msg.includes('[inter-review:')) {
        console.log('Error: commit must contain [task:], [issue:], or [inter-review:]');
        process.exit(1);
      }
      console.log('Commit message valid');
      break;
    }
    case 'skill': {
      const subcmd = args[1];
      const subargs = args.slice(2);

      // Set DB client for skill loader
      databaseSkillLoader.setDatabaseClient(db);
      await skillSystem.initialize();

      switch (subcmd) {
        case 'list': {
          const skills = await skillSystem.listSkills();
          console.log(`\n📦 Skills (${skills.length} total):\n`);
          for (const s of skills.slice(0, 20)) {
            const scoreIcon = s.safety_score >= 80 ? '🟢' : s.safety_score >= 70 ? '🟡' : '🔴';
            console.log(`  ${scoreIcon} ${s.name}`);
            console.log(`     ${s.description?.slice(0, 60) || 'No description'}`);
            if (s.use_count > 0) console.log(`     Used: ${s.use_count} times`);
            console.log();
          }
          if (skills.length > 20) {
            console.log(
              `  ... and ${skills.length - 20} more. Use 'nezha skill search <query>' to filter.`
            );
          }
          break;
        }
        case 'show': {
          const name = subargs[0];
          if (!name) {
            console.log('Usage: nezha skill show <name>');
            break;
          }
          const skill = await skillSystem.getSkill(name);
          if (!skill) {
            console.log(`Skill not found: ${name}`);
            break;
          }
          console.log(`\n📦 Skill: ${skill.name}`);
          console.log('='.repeat(50));
          console.log(`Description: ${skill.description || 'None'}`);
          console.log(`Instructions: ${(skill.instructions || 'None').slice(0, 200)}...`);
          console.log();
          break;
        }
        case 'search': {
          const query = subargs.join(' ');
          if (!query) {
            console.log('Usage: nezha skill search <query>');
            break;
          }
          const results = await skillSystem.searchSkills(query);
          console.log(`\n🔍 Search results for "${query}" (${results.length}):\n`);
          for (const s of results) {
            console.log(`  • ${s.name}`);
            console.log(`    ${s.description?.slice(0, 70) || ''}`);
            console.log();
          }
          if (results.length === 0) {
            console.log('  No matching skills found.');
          }
          break;
        }
        case 'build': {
          const name = subargs[0];
          const purpose = subargs.slice(1).join(' ');
          if (!name || !purpose) {
            console.log('Usage: nezha skill build <name> <purpose>');
            break;
          }
          await buildSkillCommand(name, purpose);
          break;
        }
        case 'suggest': {
          await suggestSkillsCommand();
          break;
        }
        default:
          console.log('Skill commands:');
          console.log('  nezha skill list              - List all skills');
          console.log('  nezha skill show <name>      - Show skill details');
          console.log('  nezha skill search <query>   - Search skills');
          console.log('  nezha skill build <name> <purpose>  - Build new skill');
          console.log('  nezha skill suggest           - Show suggested skills');
      }
      break;
    }
    case 'learn': {
      const insight = args.slice(1).join(' ');
      if (!insight) {
        console.log('Usage: nezha learn "insight"');
        break;
      }
      await db.query(
        `INSERT INTO memory (content, source, importance, tags) VALUES ($1, 'cli', 5, ARRAY['learning'])`,
        [insight]
      );
      console.log(`✅ Learning saved: ${insight.slice(0, 50)}...`);
      break;
    }
    case 'areflect': {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.log('Usage: nezha areflect "[LEARN] insight: ..."');
        break;
      }
      // Parse markers: [LEARN], [TASK], [ISSUE], etc.
      const learnMatch = text.match(/\[LEARN\]\s*insight:\s*(.+?)(?:\s*context:\s*(.+))?/i);
      const taskMatch = text.match(/\[TASK\]\s*title:\s*(.+?)(?:\s*priority:\s*(\d+))?/i);
      const issueMatch = text.match(
        /\[ISSUE\]\s*title:\s*(.+?)(?:\s*type:\s*(\w+))?(?:\s*severity:\s*(\w+))?/i
      );

      if (learnMatch && learnMatch[1]) {
        const content = learnMatch[1];
        const context = learnMatch[2] || '';
        await db.query(
          `INSERT INTO memory (content, source, importance, tags) VALUES ($1, 'areflect-cli', 5, ARRAY['learning'])`,
          [context ? `${content} (context: ${context})` : content]
        );
        console.log(`✅ Learning saved: ${content.slice(0, 50)}...`);
      }
      if (taskMatch && taskMatch[1]) {
        const title = taskMatch[1];
        const priority = parseInt(taskMatch[2] || '5', 10);
        await db.query(`INSERT INTO tasks (title, status, priority) VALUES ($1, 'PENDING', $2)`, [
          title,
          priority,
        ]);
        console.log(`✅ Task created: ${title}`);
      }
      if (issueMatch && issueMatch[1]) {
        const title = issueMatch[1];
        const severity = issueMatch[3] || 'medium';
        await db.query(`INSERT INTO issues (title, status, severity) VALUES ($1, 'open', $2)`, [
          title,
          severity,
        ]);
        console.log(`✅ Issue created: ${title}`);
      }
      if (!learnMatch && !taskMatch && !issueMatch) {
        console.log('No valid markers found. Use: [LEARN], [TASK], or [ISSUE]');
      }
      break;
    }
    default:
      console.log(`Unknown command: ${command}`);
      console.log(COMMANDS);
  }

  await db.close();
}

main().catch(err => {
  logger.error('CLI error:', err);
  process.exit(1);
});

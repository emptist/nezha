#!/usr/bin/env node
// Minimal Nezha CLI - Database operations only, no daemon/server

import { config } from 'dotenv';
config({ quiet: true });

import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { IssueCommands } from './IssueCommands.js';
import { TaskCommands } from './TaskCommands.js';
import { MeetingCommands } from './MeetingCommands.js';
import { BroadcastCommands } from './BroadcastCommands.js';

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
  nezha task-add "Fix bug" "description" --priority 8
  nezha tasks --status PENDING --json

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
    console.log('nezha v0.1.0');
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
      if (subcmd === 'discuss') {
        const title = args[2];
        const description = args.slice(3).join(' ') || '';
        if (!title) {
          console.log('Usage: nezha meeting discuss "title" "description"');
          return;
        }
        const meetingCmd = new MeetingCommands({ db });
        await meetingCmd.createDiscussion(title, description);
        console.log(`Created meeting: ${title}`);
      } else {
        console.log('Usage: nezha meeting discuss "title" "description"');
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
test

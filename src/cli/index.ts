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
import { ApiKeyService } from '../services/ApiKeyService.js';
import { EncryptionService } from '../services/EncryptionService.js';
import { InterReviewService } from '../services/InterReviewService.js';
import { databaseSkillLoader } from '../services/DatabaseSkillLoader.js';
import { skillSystem } from '../core/SkillSystem.js';
import {
  buildSkillCommand,
  listInternalSkillsCommand,
  improveSkillCommand,
  deprecateSkillCommand,
  suggestSkillsCommand,
} from './SkillBuilderCommands.js';
import { resolveMeetingId } from '../utils/resolve-id.js';

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

⚠️  IMPORTANT: Run nezha from YOUR project directory!
   Your agent ID is derived from: source + project_name (git repo) + session
   Running 'cd /path/to/nezha && nezha ...' will show you as S-*-nezha-*

Core Commands:
  task-add <title> [desc] Add a task
  tasks [--status]      List tasks
  issue-add <title>    Add an issue
  issue-list           List issues
  meeting discuss <t> <d>  Create AI discussion
  meeting opinion <id> <perspective> [--position support|oppose|neutral]

Skill Commands:
  skill list            List all approved skills
  skill show <name>     Show skill details
  skill search <query> Search skills
  skill build <name> <purpose>  Build new skill

All-in-One Commands:
  areflect <text>       Create/update: [LEARN] text [TASK] title,status [ISSUE] title,status

Knowledge Tools:
  learn <insight>       Save learning (use areflect for new content)
  archive <id>          Archive outdated knowledge
  revise <id> <text>    Update existing knowledge

announce <msg>       Programmatic notifications to all AIs

Tool Discovery:
  tools                 List available tools
  tools <name>          Show tool details
  learnTheseFirst       Priority learnings for new AI

Examples:
  nezha areflect "[LEARN] insight: ..."
  nezha areflect "[LEARN] text [TASK] title, COMPLETED [ISSUE] title, RESOLVED"
  nezha tools learn

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
      const subcmd = args[1];
      const statusIndex = args.indexOf('--status');
      const jsonIndex = args.indexOf('--json');
      const isJson = jsonIndex !== -1;
      
      if (subcmd === 'next') {
        const tasks = await db.query(
          `SELECT id, title, priority, status, created_at 
           FROM tasks WHERE status = 'PENDING' 
           ORDER BY priority DESC NULLS LAST, created_at ASC LIMIT 3`
        );
        if (isJson) {
          console.log(JSON.stringify(tasks.rows, null, 2));
        } else {
          console.log('\n📋 Next tasks:\n');
          for (const t of tasks.rows) {
            console.log(`  [${t.priority || 5}] ${t.title}`);
            console.log(`     ${t.id.slice(0, 8)} | ${t.status}`);
          }
        }
        break;
      }
      
      const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
      const taskCmd = new TaskCommands(db);
      await taskCmd.list({ status, json: isJson });
      break;
    }
    case 'task-complete': {
      const taskId = args[1];
      if (!taskId) {
        console.log('Usage: nezha task-complete <task-id>');
        return;
      }
      const taskCmd = new TaskCommands(db);
      const result = await taskCmd.updateStatus(taskId, 'COMPLETED');
      console.log(result ? `Task ${taskId.slice(0,8)} marked COMPLETED` : `Task not found`);
      break;
    }
    case 'task-complete-by-commit': {
      const taskCmd = new TaskCommands(db);
      const commitMsg = args.slice(1).join(' ') || '';
      const taskIds = commitMsg.match(/\[task:\s*([a-f0-9-]+)\]/gi) || [];
      const uniqueIds = [...new Set(taskIds.map(m => m.match(/[a-f0-9-]{36}/)?.[0]).filter((id): id is string => !!id))];
      
      if (uniqueIds.length === 0) {
        console.log('No task IDs found in commit message');
        return;
      }
      
      let completed = 0;
      for (const id of uniqueIds) {
        const result = await taskCmd.updateStatus(id, 'COMPLETED');
        if (result) completed++;
      }
      console.log(`Marked ${completed}/${uniqueIds.length} tasks COMPLETED`);
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
    case 'issue-resolve': {
      const issueId = args[1];
      if (!issueId) {
        console.log('Usage: nezha issue-resolve <issue-id> [notes]');
        return;
      }
      const notes = args.slice(2).join(' ') || undefined;
      const issueCmd = new IssueCommands(db);
      await issueCmd.resolve(issueId, notes);
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
        const limitIdx = args.indexOf('--limit');
        const statusIdx = args.indexOf('--status');
        const limitArg = limitIdx > 0 ? args[limitIdx + 1] : undefined;
        const statusArg = statusIdx > 0 ? args[statusIdx + 1] : undefined;
        const limit = limitArg && !isNaN(parseInt(limitArg, 10)) ? parseInt(limitArg, 10) : 100;
        const status = statusArg || undefined;
        await meetingDbCmd.list({ limit: Math.min(limit, 500), status: status });
      } else if (subcmd === 'show') {
        const meetingIdArg = args[2];
        if (!meetingIdArg) {
          console.log('Usage: nezha meeting show <id>');
          return;
        }
        const resolvedId = await resolveMeetingId(db, meetingIdArg);
        await meetingDbCmd.show(resolvedId || meetingIdArg);
      } else if (subcmd === 'complete') {
        const meetingIdArg = args[2];
        if (!meetingIdArg) {
          console.log('Usage: nezha meeting complete <id> [consensus]');
          return;
        }
        const resolvedId = await resolveMeetingId(db, meetingIdArg);
        const consensus = args.slice(3).join(' ') || undefined;
        await meetingDbCmd.complete(resolvedId || meetingIdArg, consensus);
      } else if (subcmd === 'cleanup') {
        const daysIdx = args.indexOf('--days');
        const days =
          daysIdx > 0 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1] as string, 10) : 5;
        await meetingDbCmd.cleanup(days);
      } else if (subcmd === 'archive') {
        const daysIdx = args.indexOf('--days');
        const days =
          daysIdx > 0 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1] as string, 10) : 30;
        await meetingDbCmd.archive(days);
      } else if (subcmd === 'search') {
        const term = args.slice(2).join(' ');
        if (!term) {
          console.log('Usage: nezha meeting search <term>');
          return;
        }
        const results = await db.query(
          `SELECT m.id, m.topic, o.author, LEFT(o.perspective, 80) as perspective, o.created_at
           FROM meetings m JOIN meeting_opinions o ON m.id = o.meeting_id
           WHERE o.perspective ILIKE '%' || $1 || '%'
           ORDER BY o.created_at DESC LIMIT 20`,
          [term]
        );
        console.log(`\n🔍 Found ${results.rows.length} matching opinion(s):\n`);
        for (const r of results.rows) {
          console.log(`  ${r.topic.slice(0, 50)}`);
          console.log(`    ${r.id.slice(0, 8)} | ${r.author} | ${r.perspective}...\n`);
        }
      } else if (subcmd === 'summary') {
        const meetingIdArg = args[2];
        if (!meetingIdArg) {
          console.log('Usage: nezha meeting summary <id>');
          return;
        }
        const resolvedId = await resolveMeetingId(db, meetingIdArg);
        const meetingId = resolvedId || meetingIdArg;
        
        const [meeting, opinions] = await Promise.all([
          db.query('SELECT topic, status, created_by, created_at FROM meetings WHERE id = $1', [meetingId]),
          db.query(`SELECT author, position, COUNT(*) as cnt FROM meeting_opinions WHERE meeting_id = $1 GROUP BY author, position`, [meetingId])
        ]);
        
        if (meeting.rows.length === 0) {
          console.log('Meeting not found');
          return;
        }
        
        const m = meeting.rows[0]!;
        const ops = opinions.rows;
        console.log(`\n📊 Meeting Summary: ${m.topic}\n`);
        console.log(`Status: ${m.status}`);
        console.log(`Created: ${m.created_at}\n`);
        console.log('Positions:');
        for (const o of ops) {
          const icon = o.position === 'support' ? '👍' : o.position === 'oppose' ? '👎' : '➖';
          console.log(`  ${icon} ${o.author}: ${o.cnt}`);
        }
      } else if (subcmd === 'recommend') {
        const term = args.slice(2).join(' ');
        if (!term) {
          console.log('Usage: nezha meeting recommend <keyword>');
          return;
        }
        const results = await db.query(
          `SELECT m.id, m.topic, COUNT(o.id) as opinion_count
           FROM meetings m
           LEFT JOIN meeting_opinions o ON m.id = o.meeting_id
           WHERE m.topic ILIKE '%' || $1 || '%' OR m.topic ILIKE '%' || $1 || '%'
           GROUP BY m.id, m.topic
           ORDER BY opinion_count DESC LIMIT 10`,
          [term]
        );
        console.log(`\n📋 Related meetings for "${term}":\n`);
        for (const r of results.rows) {
          console.log(`  ${r.topic.slice(0, 60)}`);
          console.log(`    ${r.id.slice(0, 8)} | ${r.opinion_count} opinions\n`);
        }
      } else if (subcmd === 'opinion') {
        const meetingIdArg = args[2];
        const perspective = args.slice(3).join(' ');
        if (!meetingIdArg || !perspective) {
          console.log('Usage: nezha meeting opinion <meeting-id> <perspective> [--position support|oppose|neutral] [--reasoning text]');
          return;
        }
        const resolvedId = await resolveMeetingId(db, meetingIdArg);
        const meetingId = resolvedId || meetingIdArg;
        const posIdx = args.indexOf('--position');
        const position = posIdx !== -1 ? args[posIdx + 1] as any : undefined;
        const reasoningIdx = args.indexOf('--reasoning');
        const reasoning = reasoningIdx !== -1 ? args.slice(reasoningIdx + 1).join(' ') : undefined;
        const author = (await AgentIdentityService.getResolvedIdentity()).id;
        await meetingDbCmd.addOpinion(meetingId, author, perspective, reasoning, position);
      } else {
        console.log('Usage: nezha meeting <discuss|list|show|opinion|search|summary|recommend>');
      }
      break;
    }
    case 'announce':
case 'broadcast': {
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
    case 'inner': {
      await EncryptionService.getInstance().initialize();
      const subcmd = args[1];
      const apiKeyService = ApiKeyService.getInstance(db);

      if (subcmd === 'set-model') {
        const provider = args[2];
        const model = args[3];
        if (!provider) {
          const current = await apiKeyService.getCurrentInnerModel();
          console.log(current
            ? `Provider: ${current.provider}, Model: ${current.model}`
            : 'No inner model provider configured');
          break;
        }
        await apiKeyService.setCurrentInnerProvider(provider, model);
        console.log(`Inner model provider set to: ${provider}${model ? ` with model '${model}'` : ''}`);
      } else if (subcmd === 'model') {
        const identity = await AgentIdentityService.getResolvedIdentity(true);
        console.log(identity.id);
      } else {
        console.log('Usage: nezha inner set-model [provider] [model]');
        console.log('       nezha inner model');
        console.log('');
        console.log('Commands:');
        console.log('  set-model [provider] [model]  Set the current inner AI provider and model');
        console.log('                                If no args, shows current provider and model');
        console.log('  model                         Show the inner AI agent ID');
        console.log('');
        console.log('Examples:');
        console.log('  nezha inner set-model         Show current provider and model');
        console.log('  nezha inner set-model openrouter');
        console.log('  nezha inner set-model openrouter llama3.2:3b');
        console.log('  nezha inner model             Show inner agent ID');
      }
      break;
    }
    case 'context': {
      const jsonIndex = args.indexOf('--json');
      const isJson = jsonIndex !== -1;
      const forIndex = args.indexOf('--for');
      const purpose = forIndex !== -1 ? args[forIndex + 1] : 'general';
      
      const [tasks, issues, learnings, identity] = await Promise.all([
        db.query(`SELECT id, title, priority FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC NULLS LAST, created_at ASC LIMIT 5`),
        db.query(`SELECT id, title, severity FROM issues WHERE status = 'open' ORDER BY severity, created_at DESC LIMIT 5`),
        db.query(`SELECT content FROM memory WHERE tags @> ARRAY['essential'] OR tags @> ARRAY['learning'] ORDER BY importance DESC NULLS LAST, created_at DESC LIMIT 3`),
        AgentIdentityService.getResolvedIdentity()
      ]);
      
      const context = {
        timestamp: new Date().toISOString(),
        agentId: identity.id,
        agentName: identity.displayName || identity.project || 'unknown',
        purpose,
        summary: {
          pendingTasks: tasks.rows.length,
          highPriorityTasks: tasks.rows.filter((t: any) => t.priority >= 80).length,
          openIssues: issues.rows.length,
          criticalIssues: issues.rows.filter((i: any) => i.severity === 'critical').length
        },
        nextTasks: tasks.rows.map((t: any) => ({
          id: t.id.slice(0, 8),
          title: t.title,
          priority: t.priority
        })),
        criticalIssues: issues.rows.filter((i: any) => i.severity === 'critical').map((i: any) => ({
          id: i.id.slice(0, 8),
          title: i.title
        })),
        recentLearnings: learnings.rows.map((l: any) => l.content.slice(0, 100))
      };
      
      if (isJson) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        console.log('\n📊 NEZHA CONTEXT\n');
        console.log(`🤖 Agent: ${context.agentName} (${context.agentId})`);
        console.log(`Tasks: ${context.summary.pendingTasks} pending | ${context.summary.highPriorityTasks} high priority`);
        console.log(`Issues: ${context.summary.openIssues} open | ${context.summary.criticalIssues} critical\n`);
        console.log('Next Tasks:');
        for (const t of context.nextTasks) {
          console.log(`  [${t.priority || 5}] ${t.title} (${t.id})`);
        }
      }
      break;
    }
    case 'tools':
    case 'learnTheseFirst':
    case 'learn-first': {
      const isLearnFirst = command === 'learnTheseFirst' || command === 'learn-first';
      const subcmd = isLearnFirst ? 'learn' : args[1];
      
      if (subcmd === 'learn') {
        const learnings = await db.query(
          `SELECT content, importance FROM memory WHERE tags @> ARRAY['essential'] OR tags @> ARRAY['tool-discovery'] 
           ORDER BY importance DESC NULLS LAST, created_at DESC LIMIT 10`
        );
        console.log('\n📚 Priority Learnings for New AI:\n');
        for (const l of learnings.rows) {
          let text = l.content;
          text = text.replace(/^#+\s+/gm, '').replace(/^[*•-]\s+/gm, '');
          text = text.replace(/\n.+$/g, '');
          text = text.replace(/Insight:\s*/gi, '').replace(/Context:\s*/gi, '| ');
          text = text.replace(/Problem\n.+$/gi, '').replace(/Root Cause\n.+$/gi, '');
          console.log(`  ${text.slice(0, 65)}`);
        }
        console.log(`\n${learnings.rows.length} priority learnings. More: nezha tools learn`);
        break;
      }
      
      const docs = await db.query(
        `SELECT table_name, purpose, usage_context, cli_commands, mcp_tools, tags
         FROM table_documentation WHERE ai_can_modify = true ORDER BY table_name`
      );
      if (subcmd) {
        const tool = docs.rows.find(r => r.table_name === subcmd);
        if (tool) {
          console.log(`\n🔧 Tool: ${tool.table_name}`);
          console.log('='.repeat(50));
          console.log(`Purpose: ${tool.purpose}`);
          if (tool.usage_context) console.log(`Usage: ${tool.usage_context}`);
          if (tool.cli_commands?.length) {
            console.log('\nCLI Commands:');
            for (const c of tool.cli_commands) {
              console.log(`  ${c.cmd} - ${c.desc}`);
            }
          }
          if (tool.mcp_tools?.length) {
            console.log('\nMCP Tools:', tool.mcp_tools.join(', '));
          }
        } else {
          console.log(`Tool not found: ${subcmd}`);
        }
      } else {
        console.log('\n🔧 Available Tools (table_documentation):\n');
        for (const d of docs.rows) {
          const cmdCount = d.cli_commands?.length || 0;
          const mcpCount = d.mcp_tools?.length || 0;
          console.log(`  ${d.table_name} - ${d.purpose.slice(0, 50)}`);
          if (cmdCount || mcpCount) {
            console.log(`    CLI: ${cmdCount}, MCP: ${mcpCount}`);
          }
        }
        console.log(`\nUse 'nezha tools <name>' for details or 'nezha tools learn' for priority learnings.`);
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

      // Extract IDs
      const taskMatch = msg.match(/\[task:\s*([a-f0-9-]+)\]/i);
      const issueMatch = msg.match(/\[issue:\s*([a-f0-9-]+)\]/i);
      const reviewMatch = msg.match(/\[inter-review:\s*([a-f0-9-]+)\]/i);

      // INTER-REVIEW IS MANDATORY (human requirement from the beginning)
      if (!reviewMatch) {
        console.log('\n⚠️  No inter-review found in commit message');
        console.log('   Requesting inter-review and invoking Inner AI for immediate review...\n');

        const reviewService = await InterReviewService.create(db);
        const currentIdentity = await AgentIdentityService.getResolvedIdentity();

        const { getGitHash, getGitBranch } = await import('../utils/git.js');
        const commitHash = await getGitHash() || 'unknown';
        const branch = await getGitBranch() || 'unknown';

        const request = {
          taskId: taskMatch?.[1] || undefined,
          commitHash,
          branch,
          reviewerId: currentIdentity.id,
          context: {
            message: 'Auto-requested from commit validation',
            taskDescription: taskMatch?.[1] ? `Task: ${taskMatch[1]}` : undefined,
          },
        };

        const newReviewId = await reviewService.requestReview(request, false);
        console.log(`📋 Inter-review requested: ${newReviewId}`);

        console.log('\n🔍 Inner AI is reviewing your code...');
        const prompt = `You are a senior code reviewer with expertise in TypeScript, Node.js, and software best practices. Be constructive and thorough. Focus on: correctness, maintainability, test coverage, and preventing loop script pollution.`;
        const result = await reviewService.performReview(newReviewId, prompt);
        console.log(`✅ Review completed (score: ${result.overallScore}/100)`);
        console.log(`   Summary: ${result.summary.slice(0, 100)}...`);

        if (result.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length > 0) {
          const criticalIssues = result.findings.filter(f => f.severity === 'critical' || f.severity === 'high');
          console.log(`\n⚠️  Found ${criticalIssues.length} critical/high severity issues:`);
          for (const finding of criticalIssues.slice(0, 3)) {
            console.log(`   - [${finding.severity}] ${finding.message.slice(0, 80)}`);
          }
        }

        console.log('\n📝 Please retry your commit with this review ID:');
        console.log(`   git commit -m "Your message [task:${taskMatch?.[1] || '<id>'}] [inter-review:${newReviewId}]"`);
        process.exit(1);
      }

      // TASK OR ISSUE IS MANDATORY (at least one must be present)
      if (!taskMatch && !issueMatch) {
        console.log('Error: commit must contain [task:<id>] or [issue:<id>] (or both)');
        console.log('Example: git commit -m "Fix bug [task:abc123] [inter-review:def456]"');
        process.exit(1);
      }

      // Get current AI's identity for ownership validation
      const currentIdentity = await AgentIdentityService.getResolvedIdentity();
      const currentAgentId = currentIdentity.id;

      // Validate inter-review exists, is completed, and was NOT performed by current AI
      const reviewId = reviewMatch[1];
      const reviewResult = await db.query(
        `SELECT id, status, summary, task_id, reviewer_id, session_id, reviewed_by 
         FROM inter_reviews WHERE id::text LIKE $1`,
        [`${reviewId}%`]
      );

      if (reviewResult.rows.length === 0) {
        console.log(`Error: inter-review ${reviewId} not found in database`);
        console.log('Create an inter-review first with: nezha inter-review request <task-id>');
        process.exit(1);
      }

      const review = reviewResult.rows[0]!;
      if (review.status !== 'completed') {
        console.log(`Error: inter-review ${reviewId} status is '${review.status}', must be 'completed'`);
        console.log('Wait for the inter-review to be completed before committing.');
        process.exit(1);
      }

      // Validate ownership - check if current AI performed this review
      // You cannot use a review you did yourself - need another AI to review
      if (review.reviewed_by === currentAgentId) {
        console.log(`Error: You performed this inter-review yourself (reviewed_by: ${review.reviewed_by})`);
        console.log('You cannot use your own inter-review - ask another AI to review your code first.');
        process.exit(1);
      }

      console.log(`✓ Inter-review ${reviewId} validated (status: ${review.status})`);
      console.log(`  Reviewed by: ${review.reviewed_by || 'unknown'}`);
      if (review.summary) {
        console.log(`  Summary: ${review.summary.slice(0, 80)}...`);
      }

      // Validate task if present
      if (taskMatch) {
        const taskId = taskMatch[1];
        const taskResult = await db.query(
          `SELECT id, status FROM tasks WHERE id::text LIKE $1`,
          [`${taskId}%`]
        );

        if (taskResult.rows.length === 0) {
          console.log(`Error: task ${taskId} not found in database`);
          process.exit(1);
        }

        console.log(`✓ Task ${taskId} validated`);
      }

      // Validate issue if present
      if (issueMatch) {
        const issueId = issueMatch[1];
        const issueResult = await db.query(
          `SELECT id, status FROM issues WHERE id::text LIKE $1`,
          [`${issueId}%`]
        );

        if (issueResult.rows.length === 0) {
          console.log(`Error: issue ${issueId} not found in database`);
          process.exit(1);
        }

        console.log(`✓ Issue ${issueId} validated`);
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
          const contextIndex = args.indexOf('--context');
          const jsonIndex = args.indexOf('--json');
          const isJson = jsonIndex !== -1;
          const context = contextIndex !== -1 ? args[contextIndex + 1] : '';
          
          if (context) {
            const results = await skillSystem.searchSkills(context);
            const relevant = results.filter(s => s.safety_score >= 70).slice(0, 5);
            if (isJson) {
              console.log(JSON.stringify(relevant.map(s => ({
                name: s.name,
                description: s.description,
                instructions: s.instructions?.slice(0, 200)
              })), null, 2));
            } else {
              console.log(`\n🔍 Skills suggested for "${context}":\n`);
              for (const s of relevant) {
                console.log(`  • ${s.name}`);
                console.log(`    ${s.description?.slice(0, 60)}`);
              }
            }
          } else {
            await suggestSkillsCommand();
          }
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
    case 'archive': {
      const id = args[1];
      if (!id) {
        console.log('Usage: nezha archive <memory-id> [--reason <reason>]');
        break;
      }
      const reasonIdx = args.indexOf('--reason');
      const reason = reasonIdx !== -1 ? args.slice(reasonIdx + 1).join(' ') : 'outdated';
      const timestamp = new Date().toISOString();
      await db.query(
        `UPDATE memory SET tags = array_append(tags, 'archived'), 
         content = content || ' [ARCHIVED: ' || $2 || ' at ' || $3 || ']' WHERE id = $1`,
        [id, reason, timestamp]
      );
      console.log(`Archived memory ${id}`);
      if (reason === 'outdated') {
        console.log(`💡 Consider revising if knowledge is still relevant: nezha revise ${id} <new-content>`);
      }
      break;
    }
    case 'revise': {
      const id = args[1];
      const newContent = args.slice(2).join(' ');
      if (!id || !newContent) {
        console.log('Usage: nezha revise <memory-id> <new-content>');
        break;
      }
      await db.query(
        `UPDATE memory SET content = $2, importance = 7,
         tags = ARRAY['learning', 'revised']
         WHERE id = $1`,
        [id, newContent]
      );
      console.log(`Revised memory ${id}`);
      break;
    }
    case 'areflect': {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.log('Usage: nezha areflect "[LEARN] insight: ..."');
        break;
      }
// Parse markers - supports create + update/comment
      // [LEARN] text | [TASK] title,COMPLETED | [ISSUE] title,RESOLVED
      const learnMatch = text.match(/\[LEARN\]\s*(.+?)(?=\[TASK\]|\[ISSUE\]|$)/is);
      const taskMatch = text.match(/\[TASK\]\s*(.+?)(?=\[LEARN\]|\[ISSUE\]|$)/is);
      const issueMatch = text.match(/\[ISSUE\]\s*(.+?)(?=\[LEARN\]|\[TASK\]|$)/is);

      if (learnMatch && learnMatch[1]) {
        const content = learnMatch[1].trim();
        await db.query(
          `INSERT INTO memory (content, source, importance, tags) VALUES ($1, 'areflect-cli', 5, ARRAY['learning'])`,
          [content]
        );
        console.log(`✅ Learning saved: ${content.slice(0, 50)}...`);
      }
      if (taskMatch && taskMatch[1]) {
        const raw = taskMatch[1].trim();
        const completedMatch = raw.match(/^(.+?)\s*,\s*(?:COMPLETED|DONE)/i);
        const commentMatch = raw.match(/^(.+?)\s*,\s*comment:\s*(.+)/i);
        if (completedMatch && completedMatch[1]) {
          await db.query(
            `UPDATE tasks SET status = 'COMPLETED', result = 'Completed via areflect', completed_at = NOW() WHERE title ILIKE $1 AND status != 'COMPLETED'`,
            [completedMatch[1].trim()]
          );
          console.log(`✅ Task completed: ${completedMatch[1].trim().slice(0, 40)}`);
        } else if (commentMatch && commentMatch[2]) {
          const taskTitle = commentMatch[1]?.trim() || raw;
          const taskComment = commentMatch[2]?.trim() || '';
          await db.query(`INSERT INTO memory (content, source, importance, tags) VALUES ($1, 'areflect-cli', 5, ARRAY['task-comment'])`, [`Task: ${taskTitle} - ${taskComment}`]);
          console.log(`✅ Task comment: ${taskTitle.slice(0, 40)}`);
        } else {
          await db.query(`INSERT INTO tasks (title, status, priority) VALUES ($1, 'PENDING', 5)`, [raw]);
          console.log(`✅ Task created: ${raw.slice(0, 50)}...`);
        }
      }
      if (issueMatch && issueMatch[1]) {
        const raw = issueMatch[1].trim();
        const resolvedMatch = raw.match(/^(.+?)\s*,\s*(?:RESOLVED|FIXED)/i);
        const commentMatch = raw.match(/^(.+?)\s*,\s*comment:\s*(.+)/i);
        if (resolvedMatch && resolvedMatch[1]) {
          await db.query(`UPDATE issues SET status = 'RESOLVED' WHERE title ILIKE $1 AND status != 'RESOLVED'`, [resolvedMatch[1].trim()]);
          console.log(`✅ Issue resolved: ${resolvedMatch[1].trim().slice(0, 40)}`);
        } else if (commentMatch && commentMatch[2]) {
          const issueTitle = (commentMatch && commentMatch[1]) ? commentMatch[1].trim() : raw;
          const issueComment = (commentMatch && commentMatch[2]) ? commentMatch[2].trim() : '';
          await db.query(`INSERT INTO memory (content, source, importance, tags) VALUES ($1, 'areflect-cli', 5, ARRAY['issue-comment'])`, [`Issue: ${issueTitle} - ${issueComment}`]);
          console.log(`✅ Issue comment: ${issueTitle.slice(0, 40)}`);
        } else {
          const hasSeverity = raw.match(/severity:\s*(critical|high|medium|low|cosmetic)/i);
          const severity = (hasSeverity && hasSeverity[1]) ? hasSeverity[1].toLowerCase() : 'medium';
          const titlePart = hasSeverity 
            ? raw.substring(0, raw.lastIndexOf('severity:'))
            : raw;
          const titleRaw = titlePart.match(/title:\s*(.+)/i);
          const title = (titleRaw && titleRaw[1]) ? titleRaw[1].trim() : raw;
          await db.query(`INSERT INTO issues (title, status, severity) VALUES ($1, 'open', $2)`, [title, severity]);
          console.log(`✅ Issue created: ${title.slice(0, 50)} (${severity})`);
        }
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

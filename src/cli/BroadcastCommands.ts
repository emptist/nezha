import { DatabaseClient } from '../db/DatabaseClient.js';
import { BroadcastService, BroadcastPriority } from '../services/BroadcastService.js';
import { ActivityLogService } from '../services/ActivityLogService.js';
import { colors } from '../utils/cli.js';

export class BroadcastCommands {
  private readonly broadcastService: BroadcastService;
  private readonly activityLog: ActivityLogService;

  constructor(db: DatabaseClient) {
    this.broadcastService = new BroadcastService(db);
    this.activityLog = new ActivityLogService(db);
  }

  async send(message: string, target?: string, priority?: BroadcastPriority): Promise<void> {
    const id = await this.broadcastService.sendBroadcast(message, {
      targetAgent: target,
      priority: priority,
    });
    const icon = priority === 'critical' ? '🚨' : priority === 'high' ? '⚠️' : '📢';
    console.log(`${colors.green}${icon} Broadcast sent: ${id}${colors.reset}`);
    console.log(`  To: ${target || 'all agents'}`);
    console.log(`  Priority: ${priority || 'normal'}`);
    console.log(`  Message: ${message}`);
  }

  async list(limit: number = 20): Promise<void> {
    const broadcasts = await this.broadcastService.getBroadcasts(limit);

    if (broadcasts.length === 0) {
      console.log('\nNo broadcasts found');
      return;
    }

    console.log(`\n${colors.bright}Recent Broadcasts:${colors.reset}\n`);

    for (const b of broadcasts) {
      const icon = b.priority === 'critical' ? '🚨' : b.priority === 'high' ? '⚠️' : '📢';
      const readIcon = b.readAt ? '✓' : '○';
      console.log(`${colors.cyan}[${new Date(b.createdAt).toLocaleString()}]${colors.reset}`);
      console.log(`  ${icon} [${b.priority}] ${readIcon}`);
      console.log(`  From: ${b.fromAgentName || b.fromAgent.substring(0, 12)}...`);
      if (b.gitHash) {
        console.log(`  Git: ${b.gitHash} (${b.gitBranch || 'unknown'})`);
      }
      console.log(`  Message: ${b.message.substring(0, 100)}${b.message.length > 100 ? '...' : ''}`);
      console.log();
    }
  }

  async unread(): Promise<void> {
    const broadcasts = await this.broadcastService.getUnreadBroadcasts();

    if (broadcasts.length === 0) {
      console.log('\nNo unread broadcasts');
      return;
    }

    console.log(`\n${colors.bright}Unread Broadcasts (${broadcasts.length}):${colors.reset}\n`);

    for (const b of broadcasts) {
      const icon = b.priority === 'critical' ? '🚨' : b.priority === 'high' ? '⚠️' : '📢';
      console.log(
        `${colors.green}[NEW]${colors.reset} ${colors.cyan}[${new Date(b.createdAt).toLocaleString()}]${colors.reset}`
      );
      console.log(`  ${icon} [${b.priority}]`);
      console.log(`  From: ${b.fromAgentName || b.fromAgent.substring(0, 12)}...`);
      console.log(`  Message: ${b.message.substring(0, 100)}${b.message.length > 100 ? '...' : ''}`);
      console.log();

      await this.broadcastService.markAsRead(b.id);
    }
  }

  async markRead(id?: string): Promise<void> {
    if (id) {
      await this.broadcastService.markAsRead(id);
      console.log(`${colors.green}Marked as read: ${id}${colors.reset}`);
    } else {
      const count = await this.broadcastService.markAllAsRead();
      console.log(`${colors.green}Marked ${count} broadcasts as read${colors.reset}`);
    }
  }

  async activity(agentId?: string, limit: number = 50): Promise<void> {
    const activities = agentId
      ? await this.activityLog.getActivitiesByAgent(agentId, limit)
      : await this.activityLog.getRecentActivities(limit);

    if (activities.length === 0) {
      console.log('\nNo activity found');
      return;
    }

    console.log(`\n${colors.bright}AI Activity Log:${colors.reset}\n`);

    for (const a of activities) {
      const activityColor = this.getActivityColor(a.activity);
      console.log(`${colors.cyan}[${new Date(a.timestamp).toLocaleString()}]${colors.reset}`);
      console.log(`  ${activityColor}${a.activity}${colors.reset}`);
      console.log(`  Agent: ${a.agentId.substring(0, 12)}...`);
      console.log(`  Git: ${a.gitHash || 'unknown'}@${a.gitBranch || 'unknown'}`);
      console.log(`  Env: ${a.environment}`);
      if (Object.keys(a.context).length > 0) {
        console.log(`  Context: ${JSON.stringify(a.context).substring(0, 100)}...`);
      }
      console.log();
    }
  }

  async activityStats(): Promise<void> {
    const stats = await this.activityLog.getActivityStats();

    console.log(`\n${colors.bright}Activity Statistics:${colors.reset}\n`);
    console.log(`Total Activities: ${stats.totalActivities}`);
    console.log(`Recent Errors (24h): ${stats.recentErrors}`);

    console.log(`\n${colors.bright}By Type:${colors.reset}`);
    for (const [type, count] of Object.entries(stats.activitiesByType)) {
      console.log(`  ${type}: ${count}`);
    }

    console.log(`\n${colors.bright}By Agent (Top 10):${colors.reset}`);
    for (const [agent, count] of Object.entries(stats.activitiesByAgent)) {
      console.log(`  ${agent.substring(0, 12)}...: ${count}`);
    }
  }

  private getActivityColor(activity: string): string {
    switch (activity) {
      case 'task_started':
        return colors.blue;
      case 'task_completed':
        return colors.green;
      case 'task_failed':
        return colors.red;
      case 'skill_created':
      case 'skill_used':
        return colors.magenta;
      case 'review_created':
      case 'review_completed':
        return colors.yellow;
      case 'announcement_sent':
        return colors.cyan;
      case 'error_encountered':
        return colors.red;
      default:
        return colors.white;
    }
  }
}

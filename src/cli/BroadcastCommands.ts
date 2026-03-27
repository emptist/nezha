import { DatabaseClient } from '../db/DatabaseClient.js';
import { BroadcastService, BroadcastPriority } from '../services/BroadcastService.js';
import { ActivityLogService } from '../services/ActivityLogService.js';
import { colors } from '../utils/cli.js';

export class BroadcastCommands {
  private broadcastService: BroadcastService | undefined;
  private readonly activityLog: ActivityLogService;
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.activityLog = new ActivityLogService(db);
  }

  private async getBroadcastService(): Promise<BroadcastService> {
    if (!this.broadcastService) {
      this.broadcastService = await BroadcastService.create(this.db);
    }
    return this.broadcastService;
  }

  async send(message: string, target?: string, priority?: BroadcastPriority): Promise<void> {
    const svc = await this.getBroadcastService();
    const id = await svc.sendBroadcast(message, {
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
    const svc = await this.getBroadcastService();
    const broadcasts = await svc.getBroadcasts(limit);

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
      console.log(
        `  Message: ${b.message.substring(0, 100)}${b.message.length > 100 ? '...' : ''}`
      );
      console.log();
    }
  }

  async unread(): Promise<void> {
    const svc = await this.getBroadcastService();
    const broadcasts = await svc.getUnreadBroadcasts();

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
      console.log(
        `  Message: ${b.message.substring(0, 100)}${b.message.length > 100 ? '...' : ''}`
      );
      console.log();

      await svc.markAsRead(b.id);
    }
  }

  async markRead(id?: string): Promise<void> {
    const svc = await this.getBroadcastService();
    if (id) {
      await svc.markAsRead(id);
      console.log(`${colors.green}Marked as read: ${id}${colors.reset}`);
    } else {
      const count = await svc.markAllAsRead();
      console.log(`${colors.green}Marked ${count} broadcasts as read${colors.reset}`);
    }
  }

  async resolve(pattern: string, resolution: string = 'resolved'): Promise<void> {
    const svc = await this.getBroadcastService();
    const count = await svc.resolveRelatedBroadcasts(pattern, resolution);
    console.log(`${colors.green}Resolved ${count} broadcasts matching "${pattern}"${colors.reset}`);
    console.log(`  Resolution: ${resolution}`);
  }

  async end(id: string, resolution?: string): Promise<void> {
    const svc = await this.getBroadcastService();
    await svc.endBroadcast(id, resolution);
    console.log(`${colors.green}Ended broadcast: ${id}${colors.reset}`);
    if (resolution) {
      console.log(`  Resolution: ${resolution}`);
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
    console.log(`${colors.cyan}Total activities:${colors.reset} ${stats.totalActivities}`);
    console.log(`${colors.cyan}Recent errors:${colors.reset} ${stats.recentErrors}`);
    console.log(`${colors.cyan}Activities by type:${colors.reset}`);
    for (const [type, count] of Object.entries(stats.activitiesByType)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  private getActivityColor(activity: string): string {
    if (activity.includes('completed')) return colors.green;
    if (activity.includes('failed')) return colors.red;
    if (activity.includes('started')) return colors.cyan;
    if (activity.includes('assigned')) return colors.yellow;
    return C.reset;
  }
}

const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

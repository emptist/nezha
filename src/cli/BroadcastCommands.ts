import { DatabaseClient } from '../db/DatabaseClient.js';
import { BroadcastService } from '../services/BroadcastService.js';
import { ActivityLoggingService } from '../services/ActivityLoggingService.js';
import { colors } from '../utils/cli.js';
import { Config } from '../config/Config.js';

export class BroadcastCommands {
  private readonly broadcastService: BroadcastService;
  private readonly activityLog: ActivityLoggingService;

  constructor(db: DatabaseClient) {
    this.broadcastService = new BroadcastService(db);
    this.activityLog = new ActivityLoggingService(db);
  }

  async send(message: string, target?: string): Promise<void> {
    const id = await this.broadcastService.sendBroadcast(message, target);
    console.log(`${colors.green}Broadcast sent: ${id}${colors.reset}`);
    console.log(`  To: ${target || 'all agents'}`);
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
      const isToAll = b.target === 'all';
      console.log(`${colors.cyan}[${new Date(b.createdAt).toLocaleString()}]${colors.reset}`);
      console.log(`  From: ${b.fromAgent.substring(0, 8)}...`);
      console.log(`  To: ${isToAll ? colors.yellow + 'ALL' : b.target}`);
      console.log(`  Message: ${b.message}`);
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
      console.log(
        `${colors.green}[NEW]${colors.reset} ${colors.cyan}[${new Date(b.createdAt).toLocaleString()}]${colors.reset}`
      );
      console.log(`  From: ${b.fromAgent.substring(0, 8)}...`);
      console.log(`  Message: ${b.message}`);
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
    const activity = await this.activityLog.getRecentActivity(agentId, limit);

    if (activity.length === 0) {
      console.log('\nNo activity found');
      return;
    }

    console.log(`\n${colors.bright}AI Activity Log:${colors.reset}\n`);

    for (const a of activity) {
      const activityColor = this.getActivityColor(a.activity);
      console.log(`${colors.cyan}[${new Date(a.timestamp).toLocaleString()}]${colors.reset}`);
      console.log(`  ${activityColor}${a.activity}${colors.reset}`);
      console.log(`  Agent: ${a.agentId.substring(0, 8)}...`);
      console.log(`  Git: ${a.gitHash || 'unknown'}@${a.gitBranch || 'unknown'}`);
      if (Object.keys(a.context).length > 0) {
        console.log(`  Context: ${JSON.stringify(a.context)}`);
      }
      console.log();
    }
  }

  async activityStats(agentId?: string): Promise<void> {
    const stats = await this.activityLog.getActivityStats(agentId);

    console.log(`\n${colors.bright}Activity Statistics:${colors.reset}\n`);
    console.log(`Total Activities: ${stats.totalActivities}`);
    console.log(`Tasks Completed: ${colors.green}${stats.tasksCompleted}${colors.reset}`);
    console.log(`Reviews Completed: ${colors.green}${stats.reviewsCompleted}${colors.reset}`);
    console.log(`Discussions Joined: ${colors.green}${stats.discussionsJoined}${colors.reset}`);
    console.log(`\nGit Versions Seen:`);
    for (const v of stats.gitVersions) {
      console.log(`  - ${v}`);
    }
  }

  async gitInfo(): Promise<void> {
    const info = this.activityLog.getGitInfo();
    console.log(`\n${colors.bright}Current Git Info:${colors.reset}\n`);
    console.log(`Hash: ${info.hash}`);
    console.log(`Branch: ${info.branch}`);
  }

  private getActivityColor(activity: string): string {
    switch (activity) {
      case 'task_start':
        return colors.blue;
      case 'task_complete':
        return colors.green;
      case 'task_fail':
        return colors.red;
      case 'skill_use':
        return colors.magenta;
      case 'review_complete':
        return colors.yellow;
      case 'discussion_participate':
        return colors.cyan;
      default:
        return colors.white;
    }
  }
}

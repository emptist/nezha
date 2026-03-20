import { DatabaseClient } from '../db/DatabaseClient.js';
import { TASK_STATUS } from '../config/constants.js';
import { colors } from '../utils/cli.js';
import { TaskWatchdogService } from '../services/TaskWatchdogService.js';
import { FailureAlertService } from '../services/FailureAlertService.js';
import { LongTaskManager } from '../services/LongTaskManager.js';

export interface MonitoringConfig {
  db: DatabaseClient;
}

export class MonitoringCommands {
  private readonly db: DatabaseClient;
  private readonly watchdogService: TaskWatchdogService;
  private readonly alertService: FailureAlertService;
  private readonly longTaskManager: LongTaskManager;

  constructor(config: MonitoringConfig) {
    this.db = config.db;
    this.watchdogService = new TaskWatchdogService(this.db);
    this.alertService = new FailureAlertService(this.db);
    this.longTaskManager = new LongTaskManager(this.db);
  }

  async listDLQ(limit: number = 50, showResolved: boolean = false): Promise<void> {
    const result = await this.db.query<{
      id: string;
      original_task_id: string;
      title: string;
      description: string;
      error_message: string;
      error_category: string | null;
      retry_count: number;
      max_retries: number;
      failed_at: Date;
      resolved: boolean;
      review_status: string | null;
      watchdog_kills: number;
    }>(
      `SELECT id, original_task_id, title, description, error_message, error_category, 
              retry_count, max_retries, failed_at, resolved, review_status, watchdog_kills
       FROM dead_letter_queue
       WHERE resolved = $1 OR $2 = true
       ORDER BY failed_at DESC
       LIMIT $3`,
      [showResolved ? true : false, showResolved, limit]
    );

    if (result.rows.length === 0) {
      console.log('\nDead letter queue is empty');
      return;
    }

    console.log(
      `\n${colors.bright}Dead Letter Queue (${result.rows.length} items):${colors.reset}\n`
    );

    for (const item of result.rows) {
      const categoryColor = this.getCategoryColor(item.error_category);
      console.log(`${colors.red}[${item.review_status || 'pending'}]${colors.reset} ${item.title}`);
      console.log(`  ID: ${item.original_task_id.substring(0, 8)}...`);
      console.log(
        `  ${categoryColor}[${item.error_category || 'UNKNOWN'}]${colors.reset} ${item.error_message.substring(0, 80)}...`
      );
      console.log(
        `  Retries: ${item.retry_count}/${item.max_retries} | Watchdog kills: ${item.watchdog_kills}`
      );
      console.log(`  Failed: ${new Date(item.failed_at).toLocaleString()}`);
      console.log();
    }
  }

  async resolveDLQ(id: string, notes?: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE dead_letter_queue 
       SET resolved = true, resolution_notes = $2, review_status = 'resolved'
       WHERE id = $1
       RETURNING title`,
      [id, notes || null]
    );

    if (result.rowCount > 0) {
      console.log(colors.green, `DLQ item resolved: ${result.rows[0]?.title}`);
    } else {
      console.log(colors.red, `DLQ item not found: ${id}`);
    }
  }

  async updateDLQReviewStatus(
    id: string,
    status: 'pending' | 'reviewed' | 'resolved' | 'ignored'
  ): Promise<void> {
    const result = await this.db.query(
      `UPDATE dead_letter_queue 
       SET review_status = $2, reviewed_at = NOW(), reviewed_by = 'cli'
       WHERE id = $1
       RETURNING title`,
      [id, status]
    );

    if (result.rowCount > 0) {
      console.log(colors.green, `DLQ item status updated: ${result.rows[0]?.title} -> ${status}`);
    } else {
      console.log(colors.red, `DLQ item not found: ${id}`);
    }
  }

  async deleteDLQ(id: string): Promise<void> {
    const result = await this.db.query(
      `DELETE FROM dead_letter_queue WHERE id = $1 RETURNING title`,
      [id]
    );

    if (result.rowCount > 0) {
      console.log(colors.green, `DLQ item deleted: ${result.rows[0]?.title}`);
    } else {
      console.log(colors.red, `DLQ item not found: ${id}`);
    }
  }

  async retryDLQ(id: string): Promise<void> {
    const dlqItem = await this.db.query<{
      original_task_id: string;
      title: string;
      description: string;
      error_message: string;
    }>(
      `SELECT original_task_id, title, description, error_message FROM dead_letter_queue WHERE id = $1`,
      [id]
    );

    if (dlqItem.rows.length === 0) {
      console.log(colors.red, `DLQ item not found: ${id}`);
      return;
    }

    const item = dlqItem.rows[0];
    if (!item) {
      console.log(colors.red, `DLQ item not found: ${id}`);
      return;
    }
    const newTaskId = crypto.randomUUID();
    const createdBy = process.env.NEZHA_AGENT_NAME || 'human';

    await this.db.query(
      `INSERT INTO tasks (id, title, description, status, priority, error, created_by)
       VALUES ($1, $2, $3, $4, 10, $5, $6)`,
      [
        newTaskId,
        `[RETRY] ${item.title}`,
        item.description,
        TASK_STATUS.PENDING,
        `Retry of failed task: ${item.error_message}`,
        createdBy,
      ]
    );

    await this.db.query(
      `UPDATE dead_letter_queue SET resolved = true, review_status = 'resolved', resolution_notes = 'Retried as new task'
       WHERE id = $1`,
      [id]
    );

    console.log(colors.green, `DLQ item retried as new task: ${newTaskId}`);
  }

  async listAlerts(limit: number = 50, showAcknowledged: boolean = false): Promise<void> {
    const result = await this.db.query<{
      id: string;
      alert_type: string;
      task_id: string | null;
      title: string;
      error_category: string | null;
      error_message: string | null;
      failure_count: number;
      threshold: number;
      acknowledged: boolean;
      acknowledged_by: string | null;
      acknowledged_at: Date | null;
      created_at: Date;
    }>(
      `SELECT * FROM failure_alerts
       WHERE acknowledged = $1 OR $2 = true
       ORDER BY created_at DESC
       LIMIT $3`,
      [showAcknowledged ? true : false, showAcknowledged, limit]
    );

    if (result.rows.length === 0) {
      console.log('\nNo failure alerts');
      return;
    }

    console.log(`\n${colors.bright}Failure Alerts (${result.rows.length} items):${colors.reset}\n`);

    for (const alert of result.rows) {
      const severityColor = this.getSeverityColor(alert.failure_count, alert.threshold);
      const ackStatus = alert.acknowledged ? colors.green + '[ACK]' : colors.red + '[NEW]';
      console.log(`${ackStatus}${colors.reset} ${colors.bright}${alert.title}${colors.reset}`);
      console.log(`  Type: ${alert.alert_type} | Category: ${alert.error_category || 'N/A'}`);
      console.log(
        `  ${severityColor}Count: ${alert.failure_count}/${alert.threshold}${colors.reset}`
      );
      if (alert.error_message) {
        console.log(`  Error: ${alert.error_message.substring(0, 60)}...`);
      }
      if (alert.acknowledged) {
        console.log(
          `  Acked by ${alert.acknowledged_by} at ${new Date(alert.acknowledged_at!).toLocaleString()}`
        );
      } else {
        console.log(`  Created: ${new Date(alert.created_at).toLocaleString()}`);
      }
      console.log();
    }
  }

  async acknowledgeAlert(id: string, acknowledgedBy: string = 'cli'): Promise<void> {
    const result = await this.alertService.acknowledgeAlert(id, acknowledgedBy);
    if (result) {
      console.log(colors.green, `Alert acknowledged by ${acknowledgedBy}`);
    } else {
      console.log(colors.red, `Alert not found: ${id}`);
    }
  }

  async getAlertStats(): Promise<void> {
    const stats = await this.alertService.getAlertStats();

    console.log(`\n${colors.bright}Alert Statistics:${colors.reset}\n`);
    console.log(`  Total alerts: ${stats.total}`);
    console.log(`  Unacknowledged: ${colors.yellow}${stats.unacknowledged}${colors.reset}`);

    console.log(`\n  By Type:`);
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`    ${type}: ${count}`);
    }

    console.log(`\n  By Severity:`);
    for (const [severity, count] of Object.entries(stats.bySeverity)) {
      const color = this.getSeverityLabelColor(severity);
      console.log(`    ${color}${severity}${colors.reset}: ${count}`);
    }
  }

  async getWatchdogStats(): Promise<void> {
    const stats = await this.watchdogService.getWatchdogStats();

    console.log(`\n${colors.bright}Watchdog Statistics:${colors.reset}\n`);
    console.log(`  Tracked tasks: ${stats.trackedTasks}`);
    console.log(`  Stuck tasks: ${colors.red}${stats.stuckTasks}${colors.reset}`);
    console.log(`  Killed tasks: ${colors.yellow}${stats.killedTasks}${colors.reset}`);
    console.log(`  Total kills: ${stats.totalKills}`);

    const dlqCount = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM dead_letter_queue WHERE resolved = false`
    );
    console.log(
      `  DLQ size: ${colors.yellow}${parseInt(dlqCount.rows[0]?.count || '0')}${colors.reset}`
    );
  }

  async getLongTaskStats(): Promise<void> {
    const stats = await this.longTaskManager.getLongTaskStats();

    console.log(`\n${colors.bright}Long Task Statistics:${colors.reset}\n`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  Running: ${colors.green}${stats.running}${colors.reset}`);
    console.log(`  Paused: ${colors.yellow}${stats.paused}${colors.reset}`);
    console.log(`  Exceeded max runtime: ${colors.red}${stats.exceededMaxRuntime}${colors.reset}`);
    console.log(`  Average progress: ${stats.avgProgress}%`);
  }

  async listPausedTasks(): Promise<void> {
    const paused = await this.longTaskManager.getPausedTasks();

    if (paused.length === 0) {
      console.log('\nNo paused tasks');
      return;
    }

    console.log(`\n${colors.bright}Paused Tasks (${paused.length}):${colors.reset}\n`);

    for (const task of paused) {
      console.log(`${colors.yellow}[PAUSED]${colors.reset} ${task.title}`);
      console.log(`  ID: ${task.taskId}`);
      console.log(`  Reason: ${task.pauseReason}`);
      console.log(
        `  Paused until: ${task.pausedUntil ? new Date(task.pausedUntil).toLocaleString() : 'N/A'}`
      );
      console.log(`  Progress: ${task.progressPercent}%`);
      console.log(`  Runtime: ${task.elapsedSeconds}s / ${task.maxRuntimeSeconds}s`);
      console.log();
    }
  }

  async cleanupOrphanedProcesses(thresholdMinutes: number = 60): Promise<void> {
    const orphans = await this.watchdogService.getOrphanedProcesses(thresholdMinutes);

    if (orphans.length === 0) {
      console.log(`\nNo orphaned processes found (threshold: ${thresholdMinutes} minutes)`);
      return;
    }

    console.log(`\n${colors.bright}Orphaned Processes (${orphans.length}):${colors.reset}\n`);

    for (const orphan of orphans) {
      console.log(
        `  PID: ${orphan.pid} | Age: ${orphan.ageMinutes}min | Command: ${orphan.command.substring(0, 40)}...`
      );
      console.log(`  Task ID: ${orphan.taskId || 'N/A'}`);
      console.log(`  Spawned: ${new Date(orphan.spawnedAt).toLocaleString()}`);

      const killed = await this.watchdogService.cleanupOrphanedProcess(orphan.pid);
      if (killed) {
        console.log(`  ${colors.green}Cleaned up${colors.reset}`);
      } else {
        console.log(`  ${colors.red}Cleanup failed${colors.reset}`);
      }
      console.log();
    }
  }

  async getFailureStatistics(): Promise<void> {
    const result = await this.db.query<{
      error_category: string | null;
      total_failures: string;
      stuck_count: string;
      watchdog_kills: string;
      avg_duration_seconds: string | null;
      max_retries: string | null;
      total_retries: string | null;
    }>(`SELECT * FROM failure_statistics ORDER BY total_failures DESC`);

    if (result.rows.length === 0) {
      console.log('\nNo failure statistics available');
      return;
    }

    console.log(`\n${colors.bright}Failure Statistics by Category:${colors.reset}\n`);
    console.log(
      colors.dim,
      'Category'.padEnd(12),
      'Failures'.padEnd(10),
      'Stuck'.padEnd(8),
      'Kills'.padEnd(8),
      'Avg Duration'.padEnd(14),
      'Max Retries'
    );
    console.log(colors.dim, '-'.repeat(70));

    for (const row of result.rows) {
      const cat = (row.error_category || 'UNKNOWN').padEnd(12);
      const failures = row.total_failures.padEnd(10);
      const stuck = row.stuck_count.padEnd(8);
      const kills = row.watchdog_kills.padEnd(8);
      const avgDur = row.avg_duration_seconds
        ? `${Math.round(parseFloat(row.avg_duration_seconds))}s`.padEnd(14)
        : 'N/A'.padEnd(14);
      const maxRet = row.max_retries || '0';

      const catColor = this.getCategoryColor(row.error_category);
      console.log(
        catColor,
        cat,
        failures,
        colors.red + stuck,
        colors.yellow + kills,
        avgDur,
        maxRet
      );
    }
    console.log(colors.reset);
  }

  private getCategoryColor(category: string | null): string {
    switch (category) {
      case 'NETWORK':
        return colors.cyan;
      case 'AUTH':
        return colors.red;
      case 'TIMEOUT':
        return colors.yellow;
      case 'SERVER':
        return colors.magenta;
      case 'TRANSPORT':
        return colors.blue;
      case 'LOGIC':
        return colors.red;
      case 'RESOURCE':
        return colors.yellow;
      default:
        return colors.dim;
    }
  }

  private getSeverityColor(count: number, threshold: number): string {
    const ratio = count / threshold;
    if (ratio >= 2) return colors.red;
    if (ratio >= 1.5) return colors.yellow;
    return colors.green;
  }

  private getSeverityLabelColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return colors.red;
      case 'high':
        return colors.yellow;
      case 'medium':
        return colors.cyan;
      default:
        return colors.green;
    }
  }

  async resetFailedTasks(olderThanHours: number = 0): Promise<number> {
    const result = await this.db.query(
      `UPDATE tasks 
       SET status = 'PENDING', 
           error = NULL, 
           retry_count = 0, 
           next_retry_at = NULL,
           updated_at = NOW()
       WHERE status = 'FAILED'
         AND ($1 = 0 OR completed_at < NOW() - ($1 || ' hours')::INTERVAL)
       RETURNING id, title`,
      [olderThanHours]
    );

    if (result.rows.length === 0) {
      console.log(colors.yellow, 'No failed tasks to reset');
      return 0;
    }

    console.log(colors.green, `Reset ${result.rows.length} failed tasks to PENDING:`);
    for (const row of result.rows) {
      console.log(`  - ${row.title}`);
    }

    return result.rows.length;
  }

  async retryAllDLQ(): Promise<number> {
    const dlqItems = await this.db.query<{
      id: string;
      original_task_id: string;
      title: string;
      description: string;
      error_message: string;
    }>(
      `SELECT id, original_task_id, title, description, error_message 
       FROM dead_letter_queue 
       WHERE resolved = false
       ORDER BY failed_at ASC`
    );

    if (dlqItems.rows.length === 0) {
      console.log(colors.yellow, 'No unresolved DLQ items to retry');
      return 0;
    }

    console.log(colors.bright, `Retrying ${dlqItems.rows.length} DLQ items...\n`);
    let successCount = 0;
    const createdBy = process.env.NEZHA_AGENT_NAME || 'system';

    for (const item of dlqItems.rows) {
      try {
        const newTaskId = crypto.randomUUID();

        await this.db.query(
          `INSERT INTO tasks (id, title, description, status, priority, error, created_by)
           VALUES ($1, $2, $3, $4, 10, $5, $6)`,
          [
            newTaskId,
            `[RETRY] ${item.title}`,
            item.description || '',
            TASK_STATUS.PENDING,
            `Retry from DLQ: ${item.error_message}`,
            createdBy,
          ]
        );

        await this.db.query(
          `UPDATE dead_letter_queue 
           SET resolved = true, 
               review_status = 'resolved', 
               resolution_notes = 'Retried as new task via retry-all'
           WHERE id = $1`,
          [item.id]
        );

        console.log(colors.green, `  ✓ ${item.title}`);
        successCount++;
      } catch (error) {
        console.log(colors.red, `  ✗ ${item.title}: ${error}`);
      }
    }

    console.log(`\n${colors.green}Successfully retried ${successCount}/${dlqItems.rows.length} DLQ items`);
    return successCount;
  }

  async learnFromFailures(): Promise<string[]> {
    const insights = await this.db.query<{
      error_category: string;
      failure_count: number;
      suggested_improvement: string;
      confidence_score: number;
    }>(
      `SELECT error_category, failure_count, suggested_improvement, confidence_score
       FROM suggest_improvements_from_failures(NULL, 10)
       WHERE confidence_score > 0.5`
    );

    if (insights.rows.length === 0) {
      console.log(colors.yellow, 'No improvement suggestions from failures');
      return [];
    }

    console.log(colors.bright, `\nCreating improvement tasks from ${insights.rows.length} failure patterns...\n`);
    const taskIds: string[] = [];
    const createdBy = process.env.NEZHA_AGENT_NAME || 'system';

    for (const insight of insights.rows) {
      const taskId = crypto.randomUUID();
      const title = `Improve ${insight.error_category} error handling (${insight.failure_count} failures)`;

      await this.db.query(
        `INSERT INTO tasks (id, title, description, status, priority, category, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          taskId,
          title,
          insight.suggested_improvement,
          TASK_STATUS.PENDING,
          Math.min(10, Math.floor(insight.failure_count / 2) + 3),
          'improvement',
          createdBy,
        ]
      );

      console.log(colors.cyan, `  + ${title}`);
      taskIds.push(taskId);
    }

    console.log(`\n${colors.green}Created ${taskIds.length} improvement tasks`);
    return taskIds;
  }

  async showRecoveryStats(): Promise<void> {
    const stats = await this.db.query<{
      failed_tasks_recoverable: string;
      stuck_tasks: string;
      dlq_items_pending: string;
      last_auto_recovery: Date | null;
    }>(
      `SELECT 
        (SELECT COUNT(*) FROM tasks 
         WHERE status = 'FAILED' 
         AND retry_count < 3
         AND error_category NOT IN ('FATAL', 'PERMANENT', 'INVALID_INPUT'))::TEXT as failed_tasks_recoverable,
        (SELECT COUNT(*) FROM tasks 
         WHERE status = 'RUNNING' 
         AND started_at < NOW() - INTERVAL '10 minutes')::TEXT as stuck_tasks,
        (SELECT COUNT(*) FROM dead_letter_queue WHERE resolved = false)::TEXT as dlq_items_pending,
        (SELECT created_at FROM tasks 
         WHERE created_by = 'trae-auto-recovery'
         ORDER BY created_at DESC LIMIT 1) as last_auto_recovery`
    );

    const row = stats.rows[0];
    if (!row) return;

    console.log('\n📊 Auto-Recovery Statistics\n');
    console.log(`   Recoverable Failed Tasks: ${row.failed_tasks_recoverable}`);
    console.log(`   Stuck Tasks (RUNNING >10m): ${row.stuck_tasks}`);
    console.log(`   Pending DLQ Items:         ${row.dlq_items_pending}`);
    console.log(`   Last Auto-Recovery:        ${row.last_auto_recovery || 'Never'}`);
    console.log('');
  }

  async runManualRecovery(): Promise<{
    failedTasks: number;
    stuckTasks: number;
    dlqItems: number;
  }> {
    console.log(colors.bright, '\n🔧 Running manual recovery...\n');

    const failedTasks = await this.db.query<{ id: string; title: string }>(
      `UPDATE tasks 
       SET status = 'PENDING', 
           error = NULL,
           next_retry_at = NOW() + INTERVAL '60 seconds',
           updated_at = NOW()
       WHERE status = 'FAILED'
         AND retry_count < 3
         AND error_category NOT IN ('FATAL', 'PERMANENT', 'INVALID_INPUT')
       RETURNING id, title`
    );

    if (failedTasks.rows.length > 0) {
      console.log(colors.green, `  ✓ Recovered ${failedTasks.rows.length} failed tasks`);
      for (const task of failedTasks.rows) {
        console.log(`    - ${task.title}`);
      }
    }

    const stuckTasks = await this.db.query<{ id: string; title: string }>(
      `UPDATE tasks 
       SET status = 'PENDING', 
           error = 'Manual recovery: stuck in RUNNING state',
           retry_count = COALESCE(retry_count, 0) + 1,
           updated_at = NOW()
       WHERE status = 'RUNNING'
         AND started_at < NOW() - INTERVAL '10 minutes'
       RETURNING id, title`
    );

    if (stuckTasks.rows.length > 0) {
      console.log(colors.yellow, `  ⚠ Recovered ${stuckTasks.rows.length} stuck tasks`);
      for (const task of stuckTasks.rows) {
        console.log(`    - ${task.title}`);
      }
    }

    const dlqResult = await this.retryAllDLQ();

    console.log(colors.green, '\n✓ Manual recovery complete\n');

    return {
      failedTasks: failedTasks.rows.length,
      stuckTasks: stuckTasks.rows.length,
      dlqItems: dlqResult,
    };
  }
}

/**
 * ❌ BAD EXAMPLE: Fake Continuous Work - Cron Job Script
 * 
 * This file demonstrates a FAKE continuous work pattern.
 * DO NOT USE THIS CODE IN PRODUCTION!
 * 
 * Why this is BAD:
 * - Designed to be run by crontab at regular intervals
 * - Does NOT call any LLM or AI service
 * - Just performs fixed maintenance tasks
 * - This is "pretending" to work without any intelligence
 * 
 * What makes it FAKE:
 * - The work is done by PROGRAM CODE, not by an AI
 * - No decision-making or learning capability
 * - Fixed, predetermined maintenance tasks
 * - Cannot adapt to changing requirements
 * 
 * How this would be used (BAD):
 * # In crontab:
 * * /5 * * * * /usr/bin/node /path/to/fake_cron_job.ts
 */

export class FakeCronJob {
  private runCount: number = 0;

  // ❌ FAKE: This is the main function that would be called by crontab
  async run(): Promise<void> {
    console.log(`[FakeCronJob] Starting run #${this.runCount + 1}`);
    console.log(`[FakeCronJob] Timestamp: ${new Date().toISOString()}`);
    
    // ❌ FAKE: These are all fixed maintenance tasks, no AI involved
    await this.cleanOldLogs();
    await this.updateMetrics();
    await this.sendNotifications();
    await this.backupData();
    
    this.runCount++;
    console.log(`[FakeCronJob] Run #${this.runCount} completed`);
  }

  // ❌ FAKE: Fixed log cleaning logic
  private async cleanOldLogs(): Promise<void> {
    console.log(`[FakeCronJob] Cleaning old logs...`);
    // Fixed logic: delete logs older than 7 days
    // In real code, this would use fs.unlink or similar
    await this.sleep(1000); // Simulate work
    console.log(`[FakeCronJob] ✓ Old logs cleaned`);
  }

  // ❌ FAKE: Fixed metrics update logic
  private async updateMetrics(): Promise<void> {
    console.log(`[FakeCronJob] Updating metrics...`);
    // Fixed logic: update some counters
    // In real code, this would write to a database or file
    await this.sleep(500); // Simulate work
    console.log(`[FakeCronJob] ✓ Metrics updated`);
  }

  // ❌ FAKE: Fixed notification logic
  private async sendNotifications(): Promise<void> {
    console.log(`[FakeCronJob] Sending notifications...`);
    // Fixed logic: send predefined notifications
    // In real code, this would send emails or messages
    await this.sleep(800); // Simulate work
    console.log(`[FakeCronJob] ✓ Notifications sent`);
  }

  // ❌ FAKE: Fixed backup logic
  private async backupData(): Promise<void> {
    console.log(`[FakeCronJob] Backing up data...`);
    // Fixed logic: copy files to backup location
    // In real code, this would use fs.copy or similar
    await this.sleep(2000); // Simulate work
    console.log(`[FakeCronJob] ✓ Data backed up`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): { runCount: number } {
    return { runCount: this.runCount };
  }
}

// ❌ Example usage (DO NOT USE THIS)
// This would be called by crontab every 5 minutes:
// 
// const job = new FakeCronJob();
// job.run().then(() => {
//   console.log('Cron job finished');
//   process.exit(0);
// });
// 
// In crontab:
// */5 * * * * /usr/bin/node /path/to/fake_cron_job.ts
// 
// This will run every 5 minutes, doing the same fixed tasks
// But it's NOT doing any real work - just maintenance scripts!

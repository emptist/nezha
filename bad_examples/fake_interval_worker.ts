/**
 * ❌ BAD EXAMPLE: Fake Continuous Work - Interval Timer
 * 
 * This file demonstrates a FAKE continuous work pattern.
 * DO NOT USE THIS CODE IN PRODUCTION!
 * 
 * Why this is BAD:
 * - Uses setInterval to execute predefined code
 * - Does NOT call any LLM or AI service
 * - Just updates a counter and prints status
 * - This is "pretending" to work without any intelligence
 * 
 * What makes it FAKE:
 * - The work is done by PROGRAM CODE, not by an AI
 * - No decision-making or learning capability
 * - Fixed, predetermined behavior
 * - Cannot handle complex tasks
 */

export class FakeIntervalWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private taskCount: number = 0;
  private errorCount: number = 0;

  start(intervalMs: number = 10000): void {
    console.log(`[FakeWorker] Starting with ${intervalMs}ms interval`);
    
    // ❌ FAKE: This interval executes fixed code without calling LLM
    this.intervalId = setInterval(() => {
      this.doFakeWork();
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log(`[FakeWorker] Stopped. Tasks: ${this.taskCount}, Errors: ${this.errorCount}`);
  }

  private doFakeWork(): void {
    // ❌ FAKE: This is just fixed logic, no AI decision-making
    console.log(`[FakeWorker] Executing task #${this.taskCount + 1}`);
    
    // Simulate "processing" with random success/failure
    const success = Math.random() > 0.2; // 80% success rate
    
    if (success) {
      this.taskCount++;
      console.log(`[FakeWorker] ✓ Task completed successfully`);
    } else {
      this.errorCount++;
      console.log(`[FakeWorker] ✗ Task failed (simulated error)`);
    }
    
    // Print stats
    console.log(`[FakeWorker] Stats: ${this.taskCount} success, ${this.errorCount} errors`);
  }

  getStats(): { taskCount: number; errorCount: number; isRunning: boolean } {
    return {
      taskCount: this.taskCount,
      errorCount: this.errorCount,
      isRunning: this.intervalId !== null,
    };
  }
}

// ❌ Example usage (DO NOT RUN THIS)
// const worker = new FakeIntervalWorker();
// worker.start(5000); // Run every 5 seconds
// 
// // This will run forever, executing the same fixed logic
// // But it's NOT doing any real work - just random success/failure!
// 
// setTimeout(() => worker.stop(), 60000); // Stop after 1 minute

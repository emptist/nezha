/**
 * ❌ BAD EXAMPLE: Fake Continuous Work - Loop Execution
 * 
 * This file demonstrates a FAKE continuous work pattern.
 * DO NOT USE THIS CODE IN PRODUCTION!
 * 
 * Why this is BAD:
 * - Uses while(true) to execute fixed program logic
 * - Does NOT call any LLM or AI service
 * - Just prints logs and increments a counter
 * - This is "pretending" to work without any intelligence
 * 
 * What makes it FAKE:
 * - The work is done by PROGRAM CODE, not by an AI
 * - No decision-making or learning capability
 * - Fixed, predetermined behavior
 * - Cannot adapt to new situations
 */

export class FakeDaemonLoop {
  private isRunning: boolean = false;
  private counter: number = 0;

  async start(): Promise<void> {
    this.isRunning = true;
    
    // ❌ FAKE: This loop executes fixed code without calling LLM
    while (this.isRunning) {
      // Just printing logs - no AI involved
      console.log(`[FakeDaemon] Working... (count: ${this.counter})`);
      
      // Incrementing a counter - no intelligence here
      this.counter++;
      
      // Simulating "work" with a delay
      await this.sleep(5000);
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log(`[FakeDaemon] Stopped. Total iterations: ${this.counter}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): { counter: number; isRunning: boolean } {
    return {
      counter: this.counter,
      isRunning: this.isRunning,
    };
  }
}

// ❌ Example usage (DO NOT RUN THIS)
// const daemon = new FakeDaemonLoop();
// daemon.start();
// 
// // This will run forever, printing logs every 5 seconds
// // But it's NOT doing any real work - just counting!
// 
// setTimeout(() => daemon.stop(), 60000); // Stop after 1 minute

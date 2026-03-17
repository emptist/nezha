/**
 * ❌ BAD EXAMPLE: Fake Continuous Work - Data Processing Loop
 * 
 * This file demonstrates a FAKE continuous work pattern.
 * DO NOT USE THIS CODE IN PRODUCTION!
 * 
 * Why this is BAD:
 * - Uses for loops to process data with fixed logic
 * - Does NOT call any LLM or AI service
 * - Just applies predetermined transformations
 * - This is "pretending" to work without any intelligence
 * 
 * What makes it FAKE:
 * - The work is done by PROGRAM CODE, not by an AI
 * - No decision-making or learning capability
 * - Fixed, predetermined transformations
 * - Cannot adapt to unexpected data
 */

interface DataItem {
  id: number;
  content: string;
  processed: boolean;
}

export class FakeDataProcessor {
  private processedCount: number = 0;
  private errorCount: number = 0;

  // ❌ FAKE: This processes data with fixed logic, no AI involved
  async processDataBatch(items: DataItem[]): Promise<void> {
    console.log(`[FakeProcessor] Processing ${items.length} items...`);
    
    // ❌ FAKE: Using for loop with fixed processing logic
    for (const item of items) {
      try {
        // Fixed transformation - no AI decision-making
        item.content = item.content.toUpperCase();
        item.processed = true;
        
        this.processedCount++;
        console.log(`[FakeProcessor] ✓ Processed item ${item.id}`);
      } catch (error) {
        this.errorCount++;
        console.error(`[FakeProcessor] ✗ Failed to process item ${item.id}:`, error);
      }
    }
    
    console.log(`[FakeProcessor] Batch complete. Total: ${this.processedCount}, Errors: ${this.errorCount}`);
  }

  // ❌ FAKE: This continuously processes data without AI
  async startContinuousProcessing(
    dataGenerator: () => DataItem[],
    intervalMs: number = 10000
  ): Promise<void> {
    console.log(`[FakeProcessor] Starting continuous processing...`);
    
    while (true) {
      // Generate fake data
      const items = dataGenerator();
      
      // Process with fixed logic
      await this.processDataBatch(items);
      
      // Wait before next batch
      await this.sleep(intervalMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): { processedCount: number; errorCount: number } {
    return {
      processedCount: this.processedCount,
      errorCount: this.errorCount,
    };
  }
}

// ❌ Example usage (DO NOT RUN THIS)
// const processor = new FakeDataProcessor();
// 
// // Generate fake data
// const generateData = () => [
//   { id: 1, content: 'hello', processed: false },
//   { id: 2, content: 'world', processed: false },
//   { id: 3, content: 'test', processed: false },
// ];
// 
// // This will run forever, processing data with fixed logic
// // But it's NOT doing any real work - just uppercasing strings!
// processor.startContinuousProcessing(generateData, 5000);

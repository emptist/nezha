import { benchmarkAsync, formatResult, type BenchmarkResult } from './timing.js';
import { UnifiedAgent } from '../core/UnifiedAgent.js';

const SERVER_URL = process.env.OPENCODE_SERVER_URL ?? 'http://localhost:4096';

export async function runUnifiedAgentBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

      const agent = new UnifiedAgent({
    serverUrl: SERVER_URL,
    mode: 'http',
    enableLogging: true,
    enableCache: false,
    enableFallback: false,
    timeout: 60000,
  });

    results.push(
    await benchmarkAsync(
      'UnifiedAgent: executeTask (simple ping)',
      async () => {
        await agent.executeTask('Count to 3');
      },
      { iterations: 10, warmup: 1 }
    )
  );

  results.push(
    await benchmarkAsync(
      'UnifiedAgent: executeTask (with caching)',
      async () => {
        const cachedAgent = new UnifiedAgent({
          serverUrl: SERVER_URL,
          mode: 'http',
          enableLogging: false,
          enableCache: true,
          enableFallback: false,
          timeout: 60000,
        });
        await cachedAgent.executeTask('What is 2+2?');
        const start = performance.now();
        await cachedAgent.executeTask('What is 2+2?');
        return performance.now() - start;
      },
      { iterations: 5 }
    )
  );

    const cachedAgent = new UnifiedAgent({
    serverUrl: SERVER_URL,
    mode: 'http',
    enableLogging: false,
    enableCache: true,
    enableFallback: false,
    timeout: 60000,
  });

  const uncachedTimes: number[] = [];
  const cachedTimes: number[] = [];

  for (let i = 0; i < 5; i++) {
    const msg = `What is ${i}+${i}?`;
    const start1 = performance.now();
    await cachedAgent.executeTask(msg);
    uncachedTimes.push(performance.now() - start1);

    const start2 = performance.now();
    await cachedAgent.executeTask(msg);
    cachedTimes.push(performance.now() - start2);
  }

  const uncachedAvg = uncachedTimes.reduce((a, b) => a + b, 0) / uncachedTimes.length;
  const cachedAvg = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;

  results.push({
    name: 'UnifiedAgent: Cache Speedup',
    iterations: uncachedTimes.length,
    totalMs: uncachedAvg + cachedAvg,
    avgMs: uncachedAvg - cachedAvg,
    minMs: Math.min(...uncachedTimes) - Math.max(...cachedTimes),
    maxMs: Math.max(...uncachedTimes) - Math.min(...cachedTimes),
    p50Ms: uncachedAvg - cachedAvg,
    p95Ms: uncachedAvg - cachedAvg,
    p99Ms: uncachedAvg - cachedAvg,
    opsPerSec: 0,
  });

  console.log(`  Uncached avg: ${uncachedAvg.toFixed(2)}ms`);
  console.log(`  Cached avg: ${cachedAvg.toFixed(2)}ms`);
  console.log(`  Speedup: ${(uncachedAvg / cachedAvg).toFixed(2)}x`);

    const stats = agent.getResilienceStats();
    console.log(`  Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
      for (const result of results) {
    if (result.name !== 'UnifiedAgent: Cache Speedup') {
      console.log(formatResult(result));
    }
  }

  return results;
}

export async function runAgentComparison(): Promise<void> {
  console.log('\n=== Agent Mode Comparison (HTTP vs CLI) ===\n');

  const httpAgent = new UnifiedAgent({
    serverUrl: SERVER_URL,
    mode: 'http',
    enableLogging: false,
    enableCache: false,
    timeout: 60000,
  });

  const cliAgent = new UnifiedAgent({
    serverUrl: SERVER_URL,
    mode: 'cli',
    enableLogging: false,
    enableCache: false,
    timeout: 60000,
  });

  const testTask = 'Say hello in one word';

    const httpTimes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await httpAgent.executeTask(testTask);
    httpTimes.push(performance.now() - start);
  }

    const cliTimes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await cliAgent.executeTask(testTask);
    cliTimes.push(performance.now() - start);
  }

  if (httpTimes.length > 0 && cliTimes.length > 0) {
    const httpAvg = httpTimes.reduce((a, b) => a + b, 0) / httpTimes.length;
    const cliAvg = cliTimes.reduce((a, b) => a + b, 0) / cliTimes.length;

        console.log(`HTTP agent avg latency: ${httpAvg.toFixed(2)}ms (${httpTimes.length} successful)`);
    console.log(`CLI agent avg latency: ${cliAvg.toFixed(2)}ms (${cliTimes.length} successful)`);
    console.log(`\nDifference: ${(((cliAvg - httpAvg) / httpAvg) * 100).toFixed(1)}%`);
  }
}

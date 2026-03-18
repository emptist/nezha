export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSec: number;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmup?: number;
  name?: string;
}

export function benchmark<T>(
  name: string,
  fn: () => Promise<T> | T,
  options: BenchmarkOptions = {}
): BenchmarkResult {
  const iterations = options.iterations ?? 100;
  const warmup = options.warmup ?? 2;

  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const times: number[] = [];
  let totalMs = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    const duration = end - start;
    times.push(duration);
    totalMs += duration;
  }

  times.sort((a, b) => a - b);

  const avgMs = totalMs / iterations;
  const minMs = times[0] ?? 0;
  const maxMs = times[times.length - 1] ?? 0;
  const p50Ms = percentile(times, 50);
  const p95Ms = percentile(times, 95);
  const p99Ms = percentile(times, 99);
  const opsPerSec = (1000 * iterations) / totalMs;

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    p50Ms,
    p95Ms,
    p99Ms,
    opsPerSec,
  };
}

export async function benchmarkAsync<T>(
  name: string,
  fn: () => Promise<T>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const iterations = options.iterations ?? 100;
  const warmup = options.warmup ?? 2;

  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const times: number[] = [];
  let totalMs = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    const duration = end - start;
    times.push(duration);
    totalMs += duration;
  }

  times.sort((a, b) => a - b);

  const avgMs = totalMs / iterations;
  const minMs = times[0] ?? 0;
  const maxMs = times[times.length - 1] ?? 0;
  const p50Ms = percentile(times, 50);
  const p95Ms = percentile(times, 95);
  const p99Ms = percentile(times, 99);
  const opsPerSec = (1000 * iterations) / totalMs;

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    p50Ms,
    p95Ms,
    p99Ms,
    opsPerSec,
  };
}

function percentile(sortedArr: number[], p: number): number {
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)] ?? sortedArr[0] ?? 0;
}

export function formatResult(result: BenchmarkResult): string {
  return `
${result.name}
  Iterations: ${result.iterations}
  Total: ${result.totalMs.toFixed(2)}ms
  Average: ${result.avgMs.toFixed(4)}ms
  Min: ${result.minMs.toFixed(4)}ms
  Max: ${result.maxMs.toFixed(4)}ms
  p50: ${result.p50Ms.toFixed(4)}ms
  p95: ${result.p95Ms.toFixed(4)}ms
  p99: ${result.p99Ms.toFixed(4)}ms
  Ops/sec: ${result.opsPerSec.toFixed(2)}
`;
}

export function compareResults(
  baseline: BenchmarkResult,
  candidate: BenchmarkResult
): { faster: boolean; percentDiff: number; absDiff: number } {
  const percentDiff = ((candidate.avgMs - baseline.avgMs) / baseline.avgMs) * 100;
  const absDiff = candidate.avgMs - baseline.avgMs;
  return {
    faster: candidate.avgMs < baseline.avgMs,
    percentDiff,
    absDiff,
  };
}

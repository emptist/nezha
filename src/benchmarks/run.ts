#!/usr/bin/env node

import { runConversationLoggerBenchmarks, type BenchmarkResult } from './index.js';

function printHeader(): void {
  console.log('\n' + '='.repeat(60));
  console.log('='.repeat(60) + '\n');
}

function printSummary(results: BenchmarkResult[]): void {
  printHeader();
  for (const result of results) {
    console.log(
      `  ${result.name}: avg=${result.avgMs.toFixed(2)}ms, p95=${result.p95Ms.toFixed(2)}ms, ops/s=${result.opsPerSec.toFixed(0)}`
    );
  }
}

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('Nezha Benchmarks');
  console.log('='.repeat(60));

  try {
    const results = await runConversationLoggerBenchmarks();
    printSummary(results);
  } catch (error) {
    console.error('\nBenchmarks failed:', error);
  }

  printHeader();
}

main().catch(console.error);

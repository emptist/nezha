#!/usr/bin/env node

import {
  runConversationLoggerBenchmarks,
  runTransportBenchmarks,
  runTransportComparison,
  runUnifiedAgentBenchmarks,
  runAgentComparison,
  formatResult,
  type BenchmarkResult,
} from './index.js';

interface BenchmarkSuite {
  name: string;
  run: () => Promise<BenchmarkResult[]>;
}

const suites: BenchmarkSuite[] = [
  {
    name: 'ConversationLogger',
    run: runConversationLoggerBenchmarks,
  },
  {
    name: 'Transport',
    run: runTransportBenchmarks,
  },
  {
    name: 'UnifiedAgent',
    run: runUnifiedAgentBenchmarks,
  },
];

function printHeader(title: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60) + '\n');
}

function printSummary(allResults: Map<string, BenchmarkResult[]>): void {
  printHeader('BENCHMARK SUMMARY');

  for (const [suiteName, results] of allResults) {
    console.log(`\n${suiteName}:`);
    for (const result of results) {
      console.log(
        `  ${result.name}: avg=${result.avgMs.toFixed(2)}ms, p95=${result.p95Ms.toFixed(2)}ms, ops/s=${result.opsPerSec.toFixed(0)}`
      );
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all') || args.length === 0;
  const runLogger = args.includes('--logger') || runAll;
  const runTransport = args.includes('--transport') || runAll;
  const runAgent = args.includes('--agent') || runAll;
  const runComparison = args.includes('--compare') || runAll;

  const allResults = new Map<string, BenchmarkResult[]>();

  console.log('\n' + '='.repeat(60));
  console.log('  NEZHA PERFORMANCE BENCHMARKS');
  console.log('='.repeat(60));
  console.log(`\nDate: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);

  if (runLogger) {
    try {
      const results = await runConversationLoggerBenchmarks();
      allResults.set('ConversationLogger', results);
    } catch (error) {
      console.error('\nConversationLogger benchmarks failed:', error);
    }
  }

  if (runTransport) {
    try {
      const results = await runTransportBenchmarks();
      allResults.set('Transport', results);
    } catch (error) {
      console.error('\nTransport benchmarks failed:', error);
    }
  }

  if (runAgent) {
    try {
      const results = await runUnifiedAgentBenchmarks();
      allResults.set('UnifiedAgent', results);
    } catch (error) {
      console.error('\nUnifiedAgent benchmarks failed:', error);
    }
  }

  if (runComparison) {
    printHeader('TRANSPORT COMPARISON (HTTP vs CLI)');
    try {
      await runTransportComparison();
    } catch (error) {
      console.error('Transport comparison failed:', error);
    }

    try {
      await runAgentComparison();
    } catch (error) {
      console.error('Agent comparison failed:', error);
    }
  }

  if (allResults.size > 0) {
    printSummary(allResults);
  }

  printHeader('BENCHMARKS COMPLETE');
  console.log(`\nTip: Run specific benchmarks with:`);
  console.log(`  npm run benchmark           # Run all benchmarks`);
  console.log(`  npm run benchmark -- --logger    # ConversationLogger only`);
  console.log(`  npm run benchmark -- --transport # Transport only`);
  console.log(`  npm run benchmark -- --agent    # UnifiedAgent only`);
  console.log(`  npm run benchmark -- --compare  # HTTP vs CLI comparison`);
  console.log('');
}

main().catch(console.error);

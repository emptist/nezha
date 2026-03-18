import { execSync } from 'child_process';
import { benchmarkAsync, formatResult, type BenchmarkResult } from './timing.js';
import { HttpTransport, CliTransport } from '../core/transports/index.js';

const SERVER_URL = process.env.OPENCODE_SERVER_URL ?? 'http://localhost:4096';
const TIMEOUT = 120000;

const TEST_MESSAGES = {
  short: 'Hello',
  medium: 'What is 2+2?',
  long: 'Please explain the difference between async/await and Promises.',
};

function isOpenCodeAvailable(): boolean {
  try {
    execSync('which opencode', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function runTransportBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  console.log('\n=== Transport Latency Benchmarks ===\n');
  console.log(`Server URL: ${SERVER_URL}\n`);

  const httpTransport = new HttpTransport(SERVER_URL, TIMEOUT);
  const cliTransport = new CliTransport(SERVER_URL, TIMEOUT);

  console.log('--- HttpTransport Benchmarks ---\n');

  results.push(
    await benchmarkAsync(
      'HttpTransport: createSession',
      async () => {
        httpTransport.clearSession();
        await httpTransport.createSession();
      },
      { iterations: 50 }
    )
  );

  results.push(
    await benchmarkAsync(
      'HttpTransport: sendMessage (short)',
      async () => {
        await httpTransport.sendMessage(TEST_MESSAGES.short);
      },
      { iterations: 20 }
    )
  );

  results.push(
    await benchmarkAsync(
      'HttpTransport: sendMessage (medium)',
      async () => {
        await httpTransport.sendMessage(TEST_MESSAGES.medium);
      },
      { iterations: 20 }
    )
  );

  const cliAvailable = isOpenCodeAvailable();
  if (cliAvailable) {
    console.log('\n--- CliTransport Benchmarks ---\n');

    results.push(
      await benchmarkAsync(
        'CliTransport: sendMessage (short)',
        async () => {
          await cliTransport.sendMessage(TEST_MESSAGES.short);
        },
        { iterations: 10 }
      )
    );

    results.push(
      await benchmarkAsync(
        'CliTransport: sendMessage (medium)',
        async () => {
          await cliTransport.sendMessage(TEST_MESSAGES.medium);
        },
        { iterations: 10 }
      )
    );
  } else {
    console.log('\n--- CliTransport Benchmarks ---\n');
    console.log('  (opencode CLI not available, skipping)\n');
  }

  console.log('\n--- Results ---\n');
  for (const result of results) {
    console.log(formatResult(result));
  }

  console.log('\n--- Comparison Summary ---\n');
  const httpShortResult = results.find(r => r.name === 'HttpTransport: sendMessage (short)');
  const cliShortResult = results.find(r => r.name === 'CliTransport: sendMessage (short)');

  if (httpShortResult && cliShortResult) {
    const diff = ((cliShortResult.avgMs - httpShortResult.avgMs) / httpShortResult.avgMs) * 100;
    console.log(`HttpTransport (short) avg: ${httpShortResult.avgMs.toFixed(2)}ms`);
    console.log(`CliTransport (short) avg: ${cliShortResult.avgMs.toFixed(2)}ms`);
    console.log(
      `Difference: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% (${diff > 0 ? 'Cli slower' : 'Http slower'})`
    );
  } else if (httpShortResult) {
    console.log(`HttpTransport (short) avg: ${httpShortResult.avgMs.toFixed(2)}ms`);
    console.log('CliTransport: not available');
  }

  return results;
}

export async function runTransportComparison(): Promise<void> {
  console.log('\n=== Transport Mode Comparison ===\n');

  const httpTransport = new HttpTransport(SERVER_URL, TIMEOUT);
  const cliTransport = new CliTransport(SERVER_URL, TIMEOUT);

  const iterations = 5;
  const httpTimes: number[] = [];
  const cliTimes: number[] = [];

  console.log('Running HttpTransport tests...');
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await httpTransport.sendMessage(TEST_MESSAGES.short);
      httpTimes.push(performance.now() - start);
    } catch {
      console.log(`  Attempt ${i + 1}: failed`);
    }
  }

  const cliAvailable = isOpenCodeAvailable();
  if (cliAvailable) {
    console.log('Running CliTransport tests...');
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await cliTransport.sendMessage(TEST_MESSAGES.short);
        cliTimes.push(performance.now() - start);
      } catch {
        console.log(`  Attempt ${i + 1}: failed`);
      }
    }
  } else {
    console.log('CliTransport tests skipped (opencode not available)');
  }

  if (httpTimes.length > 0) {
    const httpAvg = httpTimes.reduce((a, b) => a + b, 0) / httpTimes.length;

    console.log('\n--- Results ---\n');
    console.log(
      `HttpTransport avg latency: ${httpAvg.toFixed(2)}ms (${httpTimes.length} successful)`
    );

    if (cliTimes.length > 0) {
      const cliAvg = cliTimes.reduce((a, b) => a + b, 0) / cliTimes.length;
      console.log(
        `CliTransport avg latency: ${cliAvg.toFixed(2)}ms (${cliTimes.length} successful)`
      );
      console.log(`\nDifference: ${(((cliAvg - httpAvg) / httpAvg) * 100).toFixed(1)}%`);
    } else {
      console.log('CliTransport: not available');
    }
  }
}

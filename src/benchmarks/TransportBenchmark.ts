import { execSync } from 'child_process';
import { benchmarkAsync, formatResult, type BenchmarkResult } from './timing.js';

// STUB: Transport classes moved to piano/deprecated/
// These are stubs to allow compilation
class HttpTransport {
  constructor(_url: string, _timeout: number) {}
  clearSession() {}
  async createSession() {}
  async sendMessage(_msg: string) {
    return { ok: true, message: '' };
  }
  async getSession() {
    return { id: '', created: '' };
  }
}

class CliTransport {
  constructor(_url: string, _timeout: number) {}
  clearSession() {}
  async createSession() {}
  async sendMessage(_msg: string) {
    return { ok: true, message: '' };
  }
  async getSession() {
    return { id: '', created: '' };
  }
}

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

  const httpTransport = new HttpTransport(SERVER_URL, TIMEOUT);
  const cliTransport = new CliTransport(SERVER_URL, TIMEOUT);

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
    console.log('  (opencode CLI not available, skipping)\n');
  }

  for (const result of results) {
    console.log(formatResult(result));
  }

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
  }

  return results;
}

export async function runTransportComparison(): Promise<void> {
  const httpTransport = new HttpTransport(SERVER_URL, TIMEOUT);
  const cliTransport = new CliTransport(SERVER_URL, TIMEOUT);

  const iterations = 5;
  const httpTimes: number[] = [];
  const cliTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await httpTransport.sendMessage(TEST_MESSAGES.short);
      httpTimes.push(performance.now() - start);
    } catch {
      // ignore errors
    }
  }

  const cliAvailable = isOpenCodeAvailable();
  if (cliAvailable) {
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await cliTransport.sendMessage(TEST_MESSAGES.short);
        cliTimes.push(performance.now() - start);
      } catch {
        // ignore errors
      }
    }
  } else {
    console.log('CliTransport tests skipped (opencode not available)');
  }

  if (httpTimes.length > 0) {
    const httpAvg = httpTimes.reduce((a, b) => a + b, 0) / httpTimes.length;

    console.log(
      `HttpTransport avg latency: ${httpAvg.toFixed(2)}ms (${httpTimes.length} successful)`
    );

    if (cliTimes.length > 0) {
      const cliAvg = cliTimes.reduce((a, b) => a + b, 0) / cliTimes.length;
      console.log(
        `CliTransport avg latency: ${cliAvg.toFixed(2)}ms (${cliTimes.length} successful)`
      );
      console.log(`\nDifference: ${(((cliAvg - httpAvg) / httpAvg) * 100).toFixed(1)}%`);
    }
  }
}

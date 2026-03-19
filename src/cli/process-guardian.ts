/**
 * Process Guardian - Cleans up orphaned Nezha processes
 *
 * Usage:
 *   npx ts-node src/cli/process-guardian.ts run    - Start guardian daemon
 *   npx ts-node src/cli/process-guardian.ts status  - Show process status
 *   npx ts-node src/cli/process-guardian.ts once    - Run single cleanup
 *   npx ts-node src/cli/process-guardian.ts stop    - Stop guardian
 *
 * Cron example: Add to crontab -e:
 *   every 10 mins: 0,10,20,30,40,50 * * * * cd /path/to/nezha && npx ts-node src/cli/process-guardian.ts once
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROCESS_PID_FILE = '/tmp/nezha-guardian.pid';
const GUARDIAN_INTERVAL_MS = 60000;
const STALE_THRESHOLD_MS = 3600000;

interface GuardianConfig {
  allowedProcesses: string[];
  staleProcesses: string[];
  maxInstances: Record<string, number>;
}

function getConfig(): GuardianConfig {
  return {
    allowedProcesses: [
      'opencode serve --port 4096',
      'dist/cli/index.js start',
      'dist/cli/process-guardian.js',
      'dist/cli/nezha-cli.js daemon',
      'opencode run --format json',
    ],
    staleProcesses: ['auto-dev.js', 'self-optimize.js', 'collaborate.js', 'daemon'],
    maxInstances: {
      'opencode serve': 1,
      'dist/cli/index.js start': 1,
      'dist/cli/process-guardian.js': 1,
      'dist/cli/nezha-cli.js daemon': 1,
      'opencode run --format json': 10, // Allow some concurrent opencode runs
    },
  };
}

function getRunningProcesses(): Array<{ pid: number; command: string; started: Date }> {
  try {
    const output = execSync('ps aux | grep -E "(nezha|opencode)" | grep -v grep', {
      encoding: 'utf-8',
    });

    const processes: Array<{ pid: number; command: string; started: Date }> = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 10) {
        const pid = parseInt(parts[1] || '0', 10);
        const command = parts.slice(10).join(' ');
        const startTime = parts[8] || '';

        // Parse start time (format: HH:MM or MonDD)
        let started: Date;
        if (startTime.includes(':')) {
          const timeParts = startTime.split(':');
          const hour = parseInt(timeParts[0] || '0', 10);
          const min = parseInt(timeParts[1] || '0', 10);
          started = new Date();
          started.setHours(hour, min, 0, 0);
          // If start time is in the future, it started yesterday
          if (started > new Date()) {
            started.setDate(started.getDate() - 1);
          }
        } else {
          // Process started on a specific date (e.g., "Sun6PM")
          started = new Date(Date.now() - STALE_THRESHOLD_MS * 2); // Mark as stale
        }

        processes.push({ pid, command, started });
      }
    }

    return processes;
  } catch (err) {
    console.error(
      `[Guardian] Failed to get processes: ${err instanceof Error ? err.message : 'Unknown'}`
    );
    return [];
  }
}

function isProcessAllowed(command: string, allowed: string[]): boolean {
  return allowed.some(p => command.includes(p));
}

function isProcessStale(command: string, started: Date, stalePatterns: string[]): boolean {
  // Check if it matches stale pattern
  if (stalePatterns.some(p => command.includes(p))) {
    return true;
  }

  // Check if running too long
  const age = Date.now() - started.getTime();
  return age > STALE_THRESHOLD_MS;
}

function killProcess(pid: number): boolean {
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[Guardian] Killed process ${pid}`);
    return true;
  } catch (e) {
    console.error(`[Guardian] Failed to kill process ${pid}:`, e);
    return false;
  }
}

function checkMaxInstances(processes: Array<{ pid: number; command: string }>): void {
  const config = getConfig();

  for (const [pattern, max] of Object.entries(config.maxInstances)) {
    const count = processes.filter(p => p.command.includes(pattern)).length;

    if (count > max) {
      console.warn(`[Guardian] WARNING: ${count} instances of "${pattern}" (max: ${max})`);

      // Kill extra instances (keep the oldest)
      const instances = processes
        .filter(p => p.command.includes(pattern))
        .sort((a, b) => a.pid - b.pid);

      for (let i = 0; i < count - max; i++) {
        const instance = instances[i];
        if (instance) {
          killProcess(instance.pid);
        }
      }
    }
  }
}

function runGuardianCycle(): void {
  console.log('[Guardian] Running cycle...');

  const config = getConfig();
  const processes = getRunningProcesses();

  console.log(`[Guardian] Found ${processes.length} processes`);

  let killed = 0;

  for (const proc of processes) {
    const isAllowed = isProcessAllowed(proc.command, config.allowedProcesses);
    const isStale = isProcessStale(proc.command, proc.started, config.staleProcesses);

    if (!isAllowed && isStale) {
      console.log(`[Guardian] Removing orphaned: ${proc.command} (PID: ${proc.pid})`);
      killProcess(proc.pid);
      killed++;
    } else if (!isAllowed) {
      console.log(`[Guardian] Unknown process (reviewing): ${proc.command}`);
    }
  }

  // Check max instances
  checkMaxInstances(processes);

  console.log(`[Guardian] Cycle complete. Killed: ${killed}`);
}

function becomeGuardian(): void {
  // Write PID file
  writeFileSync(PROCESS_PID_FILE, process.pid.toString());

  console.log(`[Guardian] Starting guardian (PID: ${process.pid})`);

  // Run immediately
  runGuardianCycle();

  // Then run periodically
  setInterval(runGuardianCycle, GUARDIAN_INTERVAL_MS);
}

function stopGuardian(): void {
  if (existsSync(PROCESS_PID_FILE)) {
    const pid = parseInt(readFileSync(PROCESS_PID_FILE, 'utf-8'), 10);
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[Guardian] Stopped guardian (PID: ${pid})`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
        console.log('[Guardian] Guardian not running');
      } else {
        console.error(
          `[Guardian] Failed to stop guardian: ${err instanceof Error ? err.message : 'Unknown'}`
        );
      }
    }
  }
}

function statusGuardian(): void {
  const processes = getRunningProcesses();
  const config = getConfig();

  console.log('\n=== Nezha Process Status ===\n');

  for (const proc of processes) {
    const isAllowed = isProcessAllowed(proc.command, config.allowedProcesses);
    const status = isAllowed ? '✅ ALLOWED' : '❓ UNKNOWN';
    console.log(`PID ${proc.pid}: ${status} - ${proc.command}`);
  }

  console.log('\n=== Instance Counts ===\n');
  for (const [pattern, max] of Object.entries(config.maxInstances)) {
    const count = processes.filter(p => p.command.includes(pattern)).length;
    const icon = count <= max ? '✅' : '⚠️';
    console.log(`${icon} ${pattern}: ${count}/${max}`);
  }
}

// Main
const cmd = process.argv[2] || 'run';

switch (cmd) {
  case 'run':
    becomeGuardian();
    break;
  case 'stop':
    stopGuardian();
    break;
  case 'status':
    statusGuardian();
    break;
  case 'once':
    runGuardianCycle();
    break;
  default:
    console.log('Usage: process-guardian.js [run|stop|status|once]');
}

import { execSync } from 'node:child_process';
import {
  getLaunchAgentStatus,
  isLaunchAgentInstalled,
  isLaunchAgentLoaded,
  startLaunchAgent,
  DAEMON_LABEL,
} from '../daemon/launchd.js';
import { logger } from '../utils/logger.js';

export interface DaemonAutoStartOptions {
  autoInstall?: boolean;
  timeout?: number;
}

export class DaemonAutoStartService {
  private options: Required<DaemonAutoStartOptions>;

  constructor(options: DaemonAutoStartOptions = {}) {
    this.options = {
      autoInstall: options.autoInstall ?? true,
      timeout: options.timeout ?? 10000,
    };
  }

  async ensureDaemonRunning(): Promise<{
    success: boolean;
    status: 'running' | 'started' | 'stopped' | 'error';
    message: string;
  }> {
    console.log('[DaemonAutoStart] Checking daemon status...');

    const isInstalled = await isLaunchAgentInstalled();
    if (!isInstalled) {
      console.warn('[DaemonAutoStart] Daemon not installed');
      if (this.options.autoInstall) {
        console.log(
          '[DaemonAutoStart] Auto-install is enabled, but installation requires manual setup'
        );
        console.log('[DaemonAutoStart] Run: nezha install');
        return {
          success: false,
          status: 'stopped',
          message: 'Daemon not installed. Run: nezha install',
        };
      }
      return {
        success: false,
        status: 'stopped',
        message: 'Daemon not installed',
      };
    }

    const status = await getLaunchAgentStatus();

    if (status.status === 'running') {
      console.log(`[DaemonAutoStart] Daemon already running (PID: ${status.pid})`);
      return {
        success: true,
        status: 'running',
        message: `Daemon running (PID: ${status.pid})`,
      };
    }

    console.log('[DaemonAutoStart] Daemon not running, attempting to start...');

    try {
      const result = await startLaunchAgent();

      if (!result.ok) {
        console.error(`[DaemonAutoStart] Failed to start daemon: ${result.error}`);
        return {
          success: false,
          status: 'error',
          message: result.error || 'Failed to start daemon',
        };
      }

      console.log('[DaemonAutoStart] Daemon started successfully');

      const started = await this.waitForDaemon();

      if (started) {
        return {
          success: true,
          status: 'started',
          message: 'Daemon started successfully',
        };
      } else {
        return {
          success: false,
          status: 'error',
          message: 'Daemon failed to start within timeout',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[DaemonAutoStart] Error starting daemon: ${message}`);
      return {
        success: false,
        status: 'error',
        message,
      };
    }
  }

  private async waitForDaemon(): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.options.timeout) {
      const status = await getLaunchAgentStatus();

      if (status.status === 'running') {
        console.log(`[DaemonAutoStart] Daemon is now running (PID: ${status.pid})`);
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.warn('[DaemonAutoStart] Timeout waiting for daemon to start');
    return false;
  }

  async getStatus(): Promise<{
    installed: boolean;
    loaded: boolean;
    running: boolean;
    pid?: number;
  }> {
    const [installed, status] = await Promise.all([
      isLaunchAgentInstalled(),
      getLaunchAgentStatus(),
    ]);

    return {
      installed,
      loaded: status.status !== 'unknown',
      running: status.status === 'running',
      pid: status.pid,
    };
  }
}

export async function ensureDaemonRunning(options?: DaemonAutoStartOptions): Promise<boolean> {
  const service = new DaemonAutoStartService(options);
  const result = await service.ensureDaemonRunning();
  return result.success;
}

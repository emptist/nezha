import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export const DAEMON_LABEL = 'ai.nezha.daemon';

export interface LaunchAgentConfig {
  label?: string;
  programArguments: string[];
  workingDirectory?: string;
  stdoutPath: string;
  stderrPath: string;
  environment?: Record<string, string>;
}

export function resolveLaunchAgentPlistPath(env?: Record<string, string | undefined>): string {
  const home = os.homedir();
  const label = env?.NEZHA_LAUNCHD_LABEL?.trim() || DAEMON_LABEL;
  return path.posix.join(home, 'Library', 'LaunchAgents', `${label}.plist`);
}

export function resolveLogPaths(env?: Record<string, string | undefined>): {
  logDir: string;
  stdoutPath: string;
  stderrPath: string;
} {
  const home = os.homedir();
  const stateDir = path.join(home, '.nezha', 'daemon');
  const logDir = path.join(stateDir, 'logs');
  return {
    logDir,
    stdoutPath: path.join(logDir, 'nezha-daemon.log'),
    stderrPath: path.join(logDir, 'nezha-daemon.err.log'),
  };
}

export function buildLaunchAgentPlist(config: LaunchAgentConfig): string {
  const label = config.label || DAEMON_LABEL;
  const envVars = config.environment || {};
  const home = process.env.HOME || '/Users/' + (process.env.USER || 'jk');

  const defaultEnv: Record<string, string> = {
    HOME: home,
    TMPDIR: process.env.TMPDIR || '/tmp',
    PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
  };

  const mergedEnv = { ...defaultEnv, ...envVars };

  const envStrings = Object.entries(mergedEnv)
    .map(([k, v]) => `        <key>${k}</key>\n        <string>${v}</string>`)
    .join('\n');

  const argsStrings = config.programArguments
    .map(arg => `        <string>${escapeXml(arg)}</string>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>Comment</key>
    <string>Nezha Daemon</string>
    <key>ProgramArguments</key>
    <array>
${argsStrings}
    </array>
    <key>WorkingDirectory</key>
    <string>${escapeXml(config.workingDirectory || process.cwd())}</string>
    <key>StandardOutPath</key>
    <string>${escapeXml(config.stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(config.stderrPath)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${envStrings}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>Umask</key>
    <integer>63</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
</dict>
</plist>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function resolveGuiDomain(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
  return `gui/${uid}`;
}

async function execLaunchctl(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('launchctl', args);
    return { stdout, stderr, code: 0 };
  } catch (error: unknown) {
    const err = error as { code?: number; stderr?: string; stdout?: string };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || String(error),
      code: err.code || 1,
    };
  }
}

export async function isLaunchAgentInstalled(
  env?: Record<string, string | undefined>
): Promise<boolean> {
  const plistPath = resolveLaunchAgentPlistPath(env);
  try {
    await fs.access(plistPath);
    return true;
  } catch {
    return false;
  }
}

export async function isLaunchAgentLoaded(
  env?: Record<string, string | undefined>
): Promise<boolean> {
  const domain = resolveGuiDomain();
  const label = env?.NEZHA_LAUNCHD_LABEL?.trim() || DAEMON_LABEL;
  const res = await execLaunchctl(['print', `${domain}/${label}`]);
  return res.code === 0;
}

export async function getLaunchAgentStatus(env?: Record<string, string | undefined>): Promise<{
  status: 'running' | 'stopped' | 'unknown';
  pid?: number;
}> {
  const domain = resolveGuiDomain();
  const label = env?.NEZHA_LAUNCHD_LABEL?.trim() || DAEMON_LABEL;

  try {
    const { stdout } = await execFileAsync('launchctl', ['print', `${domain}/${label}`]);

    const pidMatch = (stdout || '').match(/pid = (\d+)/);
    const pid = pidMatch && pidMatch[1] ? parseInt(pidMatch[1], 10) : undefined;

    return {
      status: pid ? 'running' : 'stopped',
      pid,
    };
  } catch {
    return { status: 'unknown' };
  }
}

export async function installLaunchAgent(
  config: LaunchAgentConfig
): Promise<{ ok: boolean; error?: string }> {
  const plistPath = resolveLaunchAgentPlistPath();
  const plistDir = path.dirname(plistPath);

  await fs.mkdir(plistDir, { recursive: true, mode: 0o755 });

  const plistContent = buildLaunchAgentPlist(config);
  await fs.writeFile(plistPath, plistContent, { mode: 0o644 });

  return { ok: true };
}

export async function startLaunchAgent(
  env?: Record<string, string | undefined>
): Promise<{ ok: boolean; error?: string }> {
  const domain = resolveGuiDomain();
  const label = env?.NEZHA_LAUNCHD_LABEL?.trim() || DAEMON_LABEL;

  const res = await execLaunchctl(['bootstrap', domain, resolveLaunchAgentPlistPath(env)]);
  if (res.code !== 0) {
    return { ok: false, error: res.stderr || 'Bootstrap failed' };
  }

  const kickRes = await execLaunchctl(['kickstart', `-k`, `${domain}/${label}`]);
  if (kickRes.code !== 0) {
    return { ok: false, error: kickRes.stderr || 'Kickstart failed' };
  }

  return { ok: true };
}

export async function stopLaunchAgent(
  env?: Record<string, string | undefined>
): Promise<{ ok: boolean; error?: string }> {
  const domain = resolveGuiDomain();
  const label = env?.NEZHA_LAUNCHD_LABEL?.trim() || DAEMON_LABEL;

  const res = await execLaunchctl(['bootout', `${domain}/${label}`]);
  if (res.code !== 0) {
    return { ok: false, error: res.stderr || 'Bootout failed' };
  }

  return { ok: true };
}

export async function uninstallLaunchAgent(
  env?: Record<string, string | undefined>
): Promise<{ ok: boolean; error?: string }> {
  await stopLaunchAgent(env);

  const plistPath = resolveLaunchAgentPlistPath(env);
  try {
    await fs.unlink(plistPath);
  } catch {
    // Ignore if doesn't exist
  }

  return { ok: true };
}

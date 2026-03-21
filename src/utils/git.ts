import { execSync } from 'child_process';

export interface GitInfo {
  hash: string | null;
  branch: string | null;
  isDirty?: boolean;
}

export interface GitInfoOptions {
  shortHash?: boolean;
  includeDirty?: boolean;
}

const DEFAULT_OPTIONS: GitInfoOptions = {
  shortHash: false,
  includeDirty: false,
};

function safeExec(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function getGitHash(short: boolean = false): string | null {
  const cmd = short ? 'git rev-parse --short HEAD' : 'git rev-parse HEAD';
  return safeExec(cmd);
}

export function getGitBranch(): string | null {
  const branch = safeExec('git branch --show-current');
  return branch || safeExec('git rev-parse --abbrev-ref HEAD');
}

export function isGitDirty(): boolean {
  const status = safeExec('git status --porcelain');
  return status !== null && status.length > 0;
}

export function getGitInfo(options: GitInfoOptions = DEFAULT_OPTIONS): GitInfo {
  const { shortHash = false, includeDirty = false } = { ...DEFAULT_OPTIONS, ...options };

  const hash = getGitHash(shortHash);
  const branch = getGitBranch();

  const result: GitInfo = { hash, branch };

  if (includeDirty) {
    result.isDirty = isGitDirty();
  }

  return result;
}

export function getGitDiff(files?: string[]): string | null {
  const cmd = files ? `git diff --name-only ${files.join(' ')}` : 'git diff --name-only';
  return safeExec(cmd);
}

export function getCommitDiff(
  commitHash: string,
  options: { timeout?: number; maxBuffer?: number } = {}
): { stat: string | null; content: string | null } {
  const { timeout = 30000, maxBuffer = 10 * 1024 * 1024 } = options;
  let stat: string | null = null;
  let content: string | null = null;

  try {
    stat = execSync(`git diff ${commitHash}^..${commitHash} --stat`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch {
    // ignore
  }

  try {
    content = execSync(`git diff ${commitHash}^..${commitHash}`, {
      encoding: 'utf-8',
      timeout,
      maxBuffer,
    });
  } catch {
    // ignore
  }

  return { stat, content };
}

export function getLastCommitMessage(): string | null {
  return safeExec('git log -1 --format=%B');
}

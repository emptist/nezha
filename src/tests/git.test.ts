import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getGitHash,
  getGitBranch,
  getGitInfo,
  getGitDiff,
  getLastCommitMessage,
  getCommitDiff,
} from '../utils/git.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('git utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGitHash', () => {
    it('should return full hash by default', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('abc123def456\n');

      const hash = getGitHash();
      expect(hash).toBe('abc123def456');
    });

    it('should return short hash when requested', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('abc123d\n');

      const hash = getGitHash(true);
      expect(hash).toBe('abc123d');
    });

    it('should return null on error', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      const hash = getGitHash();
      expect(hash).toBeNull();
    });
  });

  describe('getGitBranch', () => {
    it('should return branch name', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('main\n');

      const branch = getGitBranch();
      expect(branch).toBe('main');
    });

    it('should fallback to rev-parse on error', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('').mockReturnValueOnce('feature-branch\n');

      const branch = getGitBranch();
      expect(branch).toBe('feature-branch');
    });

    it('should return null when both fail', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git error');
      });

      const branch = getGitBranch();
      expect(branch).toBeNull();
    });
  });

  describe('getGitInfo', () => {
    it('should return hash and branch', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('abc123d\n').mockReturnValueOnce('main\n');

      const info = getGitInfo({ shortHash: true });
      expect(info.hash).toBe('abc123d');
      expect(info.branch).toBe('main');
    });

    it('should include isDirty when requested', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync)
        .mockReturnValueOnce('abc123d\n')
        .mockReturnValueOnce('main\n')
        .mockReturnValueOnce('M  file1.ts\n');

      const info = getGitInfo({ shortHash: true, includeDirty: true });
      expect(info.isDirty).toBe(true);
    });
  });

  describe('getGitDiff', () => {
    it('should return changed files', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('file1.ts\nfile2.ts\n');

      const diff = getGitDiff();
      expect(diff).toBe('file1.ts\nfile2.ts');
    });

    it('should return null on error', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git error');
      });

      const diff = getGitDiff();
      expect(diff).toBeNull();
    });
  });

  describe('getLastCommitMessage', () => {
    it('should return last commit message', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('feat: add new feature\n');

      const message = getLastCommitMessage();
      expect(message).toBe('feat: add new feature');
    });
  });

  describe('getCommitDiff', () => {
    it('should return stat and content', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync)
        .mockReturnValueOnce(' 1 file changed, 10 insertions(+)\n')
        .mockReturnValueOnce('+new line\n-old line\n');

      const diff = getCommitDiff('abc123');
      expect(diff.stat).toBe(' 1 file changed, 10 insertions(+)\n');
      expect(diff.content).toBe('+new line\n-old line\n');
    });

    it('should handle partial failure', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync)
        .mockReturnValueOnce(' 1 file changed\n')
        .mockImplementationOnce(() => {
          throw new Error('Timeout');
        });

      const diff = getCommitDiff('abc123');
      expect(diff.stat).toBe(' 1 file changed\n');
      expect(diff.content).toBeNull();
    });
  });
});

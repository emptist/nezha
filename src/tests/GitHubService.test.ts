import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubService } from '../../src/services/GitHubService.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GitHubService', () => {
  let service: GitHubService;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-github-token-12345';
    service = new GitHubService();
    mockFetch.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  describe('constructor', () => {
    it('should be enabled when GITHUB_TOKEN is set', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should be disabled when GITHUB_TOKEN is not set', () => {
      delete process.env.GITHUB_TOKEN;
      const svc = new GitHubService();
      expect(svc.isEnabled()).toBe(false);
    });
  });

  describe('createIssue', () => {
    const mockIssueResponse = {
      number: 42,
      title: 'Test Issue',
      body: 'Test body content',
      state: 'open',
      labels: ['bug'],
      html_url: 'https://github.com/test/repo/issues/42',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockIssueResponse,
      } as Response);
    });

    it('should create an issue successfully', async () => {
      const result = await service.createIssue({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Test Issue',
        body: 'Test body content',
        labels: ['bug'],
      });

      expect(result.number).toBe(42);
      expect(result.title).toBe('Test Issue');
      expect(result.state).toBe('open');
      expect(result.html_url).toContain('issues/42');
    });

    it('should call GitHub API with correct URL', async () => {
      await service.createIssue({
        owner: 'myowner',
        repo: 'myrepo',
        title: 'Test',
        body: 'Body',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/myowner/myrepo/issues'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include labels in request when provided', async () => {
      await service.createIssue({
        owner: 'test',
        repo: 'repo',
        title: 'Title',
        body: 'Body',
        labels: ['bug', 'security'],
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.labels).toEqual(['bug', 'security']);
    });

    it('should throw when token not configured', async () => {
      delete process.env.GITHUB_TOKEN;
      const svc = new GitHubService();

      await expect(
        svc.createIssue({ owner: 'test', repo: 'test', title: 'Test', body: 'Body' })
      ).rejects.toThrow('token not configured');
    });

    it('should throw on API error response', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => 'Validation failed',
      } as Response);

      await expect(
        service.createIssue({ owner: 'test', repo: 'test', title: 'Test', body: 'Body' })
      ).rejects.toThrow('GitHub API error');
    });
  });

  describe('rate limiting', () => {
    it('should throw when rate limit exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ number: i, title: `Issue ${i}`, body: '', state: 'open', labels: [], html_url: '', created_at: '', updated_at: '' }),
        } as Response);
      }

      for (let i = 0; i < 30; i++) {
        await service.createIssue({
          owner: 'test',
          repo: 'test',
          title: `Issue ${i}`,
          body: '',
        });
      }

      await expect(
        service.createIssue({ owner: 'test', repo: 'test', title: 'Overflow', body: '' })
      ).rejects.toThrow('rate limit');
    });
  });

  describe('authentication headers', () => {
    it('should include Bearer token in requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ number: 1, title: 'T', body: '', state: 'open', labels: [], html_url: '', created_at: '', updated_at: '' }),
      } as Response);

      await service.createIssue({
        owner: 'test',
        repo: 'test',
        title: 'Test',
        body: 'Body',
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-github-token-12345');
    });

    it('should include GitHub API version header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ number: 1, title: 'T', body: '', state: 'open', labels: [], html_url: '', created_at: '', updated_at: '' }),
      } as Response);

      await service.createIssue({
        owner: 'test',
        repo: 'test',
        title: 'Test',
        body: 'Body',
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });
  });
});

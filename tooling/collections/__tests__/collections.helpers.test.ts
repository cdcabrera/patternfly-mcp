import { jest } from '@jest/globals';
import {
  DEFAULT_TRACKED_REPOS,
  extractCommitHash,
  extractRepoInfo,
  fetchLatestRepoHashes,
  verifyUrlReachability
} from '../collections.helpers';

describe('DEFAULT_TRACKED_REPOS', () => {
  it('should define expected tracked repositories with default main branch', () => {
    expect(DEFAULT_TRACKED_REPOS.length).toBeGreaterThan(0);
    const repoNames = DEFAULT_TRACKED_REPOS.map(repo => `${repo.owner}/${repo.repo}`);

    expect(repoNames).toContain('patternfly/patternfly-org');
    expect(repoNames).toContain('patternfly/patternfly-react');
    expect(repoNames).toContain('rh-uxd/ai-helpers');
    expect(repoNames).toContain('patternfly/patternfly-cli');
    expect(repoNames).toContain('patternfly/patternfly-elements');
    expect(repoNames).toContain('patternfly/patternfly-mcp');
    expect(repoNames).toContain('patternfly/pf-codemods');

    for (const repo of DEFAULT_TRACKED_REPOS) {
      expect(repo.branch).toBe('main');
    }
  });
});

describe('extractCommitHash', () => {
  it('should extract commit hashes and branch refs from valid raw GitHub URLs', () => {
    const fullShaUrl =
      'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/packages/documentation-site/patternfly-docs/content/AI/ai.md';

    expect(extractCommitHash(fullShaUrl)).toBe('540bb0d31cb18670dd02857f80aa8b444fed9be9');

    const branchUrl =
      'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md';

    expect(extractCommitHash(branchUrl)).toBe('main');
  });

  it('should return null for invalid or non-GitHub URLs', () => {
    expect(extractCommitHash('https://example.com/invalid')).toBeNull();
    expect(extractCommitHash('https://github.com/patternfly/patternfly-org/blob/main/README.md')).toBeNull();
    expect(extractCommitHash('')).toBeNull();
    expect(extractCommitHash(null as unknown as string)).toBeNull();
    expect(extractCommitHash(undefined as unknown as string)).toBeNull();
  });
});

describe('extractRepoInfo', () => {
  it('should correctly parse owner, repo, ref, and filePath from raw GitHub URLs', () => {
    const rawUrl =
      'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31359c381c8152331575ca2481e3fe1ff/packages/v4/src/content/components/button.md';

    expect(extractRepoInfo(rawUrl)).toEqual({
      owner: 'patternfly',
      repo: 'patternfly-org',
      ref: '540bb0d31359c381c8152331575ca2481e3fe1ff',
      filePath: 'packages/v4/src/content/components/button.md'
    });
  });

  it('should return null for malformed URLs or non-string inputs', () => {
    expect(extractRepoInfo('invalid-url')).toBeNull();
    expect(extractRepoInfo('https://raw.githubusercontent.com/incomplete')).toBeNull();
    expect(extractRepoInfo('')).toBeNull();
    expect(extractRepoInfo(null as unknown as string)).toBeNull();
    expect(extractRepoInfo(undefined as unknown as string)).toBeNull();
  });
});

describe('verifyUrlReachability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return true when HEAD request succeeds', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    const reachable = await verifyUrlReachability('https://raw.githubusercontent.com/test/file.md');

    expect(reachable).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/test/file.md',
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  it('should fall back to GET when HEAD returns 405 or 403', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 405 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const reachable = await verifyUrlReachability('https://raw.githubusercontent.com/test/file.md');

    expect(reachable).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://raw.githubusercontent.com/test/file.md',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should return false when fetch throws network error or times out', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const reachable = await verifyUrlReachability('https://raw.githubusercontent.com/test/file.md');

    expect(reachable).toBe(false);
  });
});

describe('fetchLatestRepoHashes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fetch commit SHAs from GitHub API and index by owner/repo and repo name', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('patternfly-react')) {
        return {
          ok: true,
          json: async () => ({ sha: 'mock-react-sha-123' })
        } as Response;
      }

      return { ok: false, status: 404 } as Response;
    });

    const repos = [
      { owner: 'patternfly', repo: 'patternfly-react', branch: 'main' },
      { owner: 'patternfly', repo: 'nonexistent', branch: 'main' }
    ];

    const hashes = await fetchLatestRepoHashes(repos);

    expect(hashes.get('patternfly/patternfly-react')).toBe('mock-react-sha-123');
    expect(hashes.get('patternfly-react')).toBe('mock-react-sha-123');
    expect(hashes.has('patternfly/nonexistent')).toBe(false);
  });

  it('should handle fetch failures gracefully without throwing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Rate limit exceeded'));

    const hashes = await fetchLatestRepoHashes([
      { owner: 'patternfly', repo: 'patternfly-org', branch: 'main' }
    ]);

    expect(hashes.size).toBe(0);
  });
});

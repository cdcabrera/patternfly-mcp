import { jest } from '@jest/globals';

const mockWriteFile = jest.fn();

jest.unstable_mockModule('node:fs/promises', () => ({
  writeFile: mockWriteFile
}));

const {
  DEFAULT_TRACKED_REPOS,
  extractCommitHash,
  extractRepoInfo,
  fetchLatestRepoHashes,
  runUpdateTask,
  verifyUrlReachability,
  writeJsonCollection
} = await import('../helpers');

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

describe('writeJsonCollection', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    mockWriteFile.mockResolvedValue(undefined as never);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should format JSON as pretty-printed by default with trailing newline', async () => {
    const targetPath = '/path/to/collection.json';
    const data = { key: 'value', count: 42 };

    const result = await writeJsonCollection(targetPath, data);

    const expectedJson = JSON.stringify(data, null, 2);

    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, expectedJson + '\n', 'utf-8');
    expect(result.jsonContent).toBe(expectedJson);
    expect(logSpy).toHaveBeenCalledWith(`✅ Updated ${targetPath}:`);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/File Size: \d+\.\d+ KB/));
  });

  it('should format JSON in compact format when isPrettyPrint is false', async () => {
    const targetPath = '/path/to/compact.json';
    const data = { a: 1, b: 2 };

    const result = await writeJsonCollection(targetPath, data, { isPrettyPrint: false });

    const expectedJson = JSON.stringify(data);

    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, expectedJson + '\n', 'utf-8');
    expect(result.jsonContent).toBe(expectedJson);
  });

  it('should calculate elapsed time when startTime is supplied and log custom stats', async () => {
    const targetPath = '/path/to/stats.json';
    const data = { items: [1, 2, 3] };
    const startTime = Date.now() - 1500;

    const result = await writeJsonCollection(targetPath, data, {
      startTime,
      stats: [
        { label: 'Total Items', value: 3 },
        { label: 'Status', value: 'OK' }
      ]
    });

    expect(logSpy).toHaveBeenCalledWith('   - Total Items: 3');
    expect(logSpy).toHaveBeenCalledWith('   - Status: OK');
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Time Elapsed: \d+\.\d+s/));
    expect(typeof result.durationSec).toBe('string');
    expect(typeof result.sizeKb).toBe('string');
  });
});

describe('runUpdateTask', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('should not invoke task function if UPDATE_COLLECTIONS is not set to true', async () => {
    delete process.env.UPDATE_COLLECTIONS;
    const taskFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runUpdateTask('Test Task', taskFn);

    expect(taskFn).not.toHaveBeenCalled();
  });

  it('should invoke task function if UPDATE_COLLECTIONS is true', async () => {
    process.env.UPDATE_COLLECTIONS = 'true';
    const taskFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runUpdateTask('Test Task', taskFn);

    expect(taskFn).toHaveBeenCalledTimes(1);
  });

  it('should invoke task function based on custom envVar option', async () => {
    process.env.CUSTOM_TRIGGER = 'true';
    const taskFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await runUpdateTask('Custom Task', taskFn, { envVar: 'CUSTOM_TRIGGER' });

    expect(taskFn).toHaveBeenCalledTimes(1);
  });

  it('should catch task errors, log failure message, and exit with status code 1', async () => {
    process.env.UPDATE_COLLECTIONS = 'true';
    const testError = new Error('Task execution failed');
    const taskFn = jest.fn<() => Promise<void>>().mockRejectedValue(testError);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await runUpdateTask('Failing Task', taskFn);

    expect(errorSpy).toHaveBeenCalledWith('❌ Failed to update Failing Task:', testError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

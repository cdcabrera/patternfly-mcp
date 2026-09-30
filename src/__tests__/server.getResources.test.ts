import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import {
  matchPackageVersion,
  findNearestPackageJson,
  readLocalFileFunction,
  fetchUrlFunction,
  processDocsFunction,
  promiseQueue,
  loadFileFetch,
  resolveLocalPathFunction
} from '../server.getResources';
import { runWithOptions } from '../options.context';
import { DEFAULT_OPTIONS } from '../options.defaults';

// Mock dependencies
jest.mock('node:fs/promises');

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('matchPackageVersion', () => {
  it.each([
    {
      description: 'with semver',
      version: '1.2.3',
      expectedIndex: 0
    },
    {
      description: 'with semver with leading v',
      version: 'v1.2.3',
      expectedIndex: 0
    },
    {
      description: 'with greater than',
      version: '>1.0.0',
      expectedIndex: 2
    },
    {
      description: 'with less than',
      version: '<2.0.0',
      expectedIndex: 0
    },
    {
      description: 'unavailable version',
      version: 'v4',
      expectedIndex: -1
    },
    {
      description: 'with inclusive range',
      version: '1.2.3 - 3.0.0',
      expectedIndex: 2
    },
    {
      description: 'with range greater than and less than',
      version: '>1.2.3 <2.0.0',
      expectedIndex: -1
    },
    {
      description: 'with range reversed greater than and less than',
      version: '<2.0.0 >1.2.3',
      expectedIndex: -1
    },
    {
      description: 'with range greater than and less than equal',
      version: '>1.2.3 <=2.0.0',
      expectedIndex: 1
    },
    {
      description: 'with range greater than equal and less than',
      version: '>=1.2.3 <v2.0.0',
      expectedIndex: 0
    },
    {
      description: 'with range reversed greater than equal and less than',
      version: '<2.0.0 >=1.2.3',
      expectedIndex: 0
    },
    {
      description: 'with range reversed, wildcards, greater than and less than equal',
      version: '<=2.x.x >1.2.3',
      expectedIndex: 1
    },
    {
      description: 'with range greater than equal and less than equal',
      version: '>=1.2.3 <=3.0.0',
      expectedIndex: 2
    },
    {
      description: 'with range reversed greater than equal and less than equal',
      version: '<=3.0.0 >=1.2.3',
      expectedIndex: 2
    }
  ])('should match version: $description', ({ version, expectedIndex }) => {
    const supportedVersions = ['1.2.3', '2.0.0', '3.0.0'];
    const result = matchPackageVersion(version, supportedVersions);

    expect(supportedVersions.indexOf(result?.version as any)).toBe(expectedIndex);
  });
});

describe('findNearestPackageJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should find the nearest package.json', () => {
    // Use the PF MCP package.json
    const path = findNearestPackageJson(process.cwd());

    expect(path).toBe(join(process.cwd(), 'package.json'));
  });

  it.each([
    {
      description: 'current working directory with relative made up directory',
      packagePath: `${process.cwd()}/./madeUpLoremIpsum/directory`
    },
    {
      description: 'current working directory with relative made up and one up directory',
      packagePath: `${process.cwd()}/../madeUpLoremIpsum/directory`
    },
    {
      description: 'relative made up directory',
      packagePath: './madeUpLoremIpsum/directory'
    },
    {
      description: 'relative made up and one up directory',
      packagePath: '../madeUpLoremIpsum/directory'
    },
    {
      description: 'Windows relative made up and one up directory',
      packagePath: '..\\madeUpLoremIpsum\\directory'
    }
  ])('should attempt to find the nearest package.json, $description', ({ packagePath }) => {
    // Use the PF MCP package.json
    const path = findNearestPackageJson(packagePath);

    expect(path).toBeDefined();
    expect(path).not.toContain('madeUpLoremIpsum');
  });

  it.each([
    {
      description: 'absolute made up directory',
      packagePath: '/madeUpLoremIpsum/directory'
    },
    {
      description: 'file URL',
      packagePath: 'file://madeUpLoremIpsum/directory'
    }
  ])('should return undefined if no package.json is found', ({ packagePath }) => {
    const path = findNearestPackageJson(packagePath);

    expect(path).toBeUndefined();
  });
});

describe('readLocalFileFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attempt to read a file from disk', async () => {
    mockReadFile.mockResolvedValue('file content');

    const result = await readLocalFileFunction('/path/to/file.md');

    expect(mockReadFile).toHaveBeenCalledWith('/path/to/file.md', 'utf-8');
    expect(result).toBe('file content');
  });

  it('should have memo property', () => {
    expect(readLocalFileFunction.memo).toBeDefined();
  });
});

describe('fetchUrlFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('should attempt to fetch a URL', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => {
          if (name === 'content-type') {
            return 'text/plain';
          }

          return null;
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('fetched content'));
          controller.close();
        }
      })
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const result = await fetchUrlFunction('https://patternfly.org/doc.md');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://patternfly.org/doc.md',
      expect.objectContaining({
        method: 'GET'
      })
    );
    expect(result).toBe('fetched content');
  });

  it('should handle non-OK responses', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: {
        get: () => null
      }
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    await expect(fetchUrlFunction('https://patternfly.org/missing.md'))
      .rejects
      .toThrow('404 Not Found');
  });

  it('should have memo property', () => {
    expect(fetchUrlFunction.memo).toBeDefined();
  });
});

describe('resolveLocalPathFunction', () => {
  it.each([
    {
      description: 'basic',
      path: 'lorem-ipsum.md'
    },
    {
      description: 'url, http',
      path: 'http://example.com/dolor-sit.md'
    },
    {
      description: 'url, https',
      path: 'https://example.com/dolor-sit.md'
    },
    {
      description: 'url, file',
      path: 'file://someDirectory/dolor-sit.md'
    },
    {
      description: 'documentation slug',
      path: 'documentation:guidelines/README.md'
    },
    {
      description: 'relative path with valid navigation',
      path: './subdir/../file.md'
    }
  ])('should return a consistent path, $description', ({ path }) => {
    const result = resolveLocalPathFunction(path, undefined, { ...DEFAULT_OPTIONS, contextPath: '/app/project', docsPaths: ['/app/project/documentation'] });

    expect(result).toMatchSnapshot();
  });

  it.each([
    {
      description: 'sibling directory traversal attempt',
      path: '../patternfly-mcp-secret/config.json',
      shouldThrow: 'Access denied'
    },
    {
      description: 'absolute path outside base',
      path: '/etc/passwd',
      shouldThrow: 'Access denied'
    },
    {
      description: 'documentation traversal attempt',
      path: 'documentation:../../etc/passwd',
      shouldThrow: 'Access denied'
    },
    {
      description: 'path matching prefix but not boundary',
      path: '../project-sibling/file.txt',
      shouldThrow: 'Access denied'
    }
  ])('should return a consistent path or throw, $description', ({ path, shouldThrow }) => {
    expect(() => resolveLocalPathFunction(path, undefined, { ...DEFAULT_OPTIONS, contextPath: '/app/project', docsPaths: ['/app/project/documentation'] })).toThrow(shouldThrow);
  });
});

describe('loadFileFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with local file',
      pathUrl: 'dolor-sit.md',
      expectedIsFetch: false
    },
    {
      description: 'with remote URL',
      pathUrl: 'https://example.com/remote.md',
      expectedIsFetch: true
    },
    {
      description: 'with documentation slug',
      pathUrl: 'documentation:guidelines/README.md',
      expectedIsFetch: false
    }
  ])('should attempt to load a file or fetch, $description', async ({ pathUrl, expectedIsFetch }) => {
    const mockFetchCall = jest.fn().mockResolvedValue('content') as any;
    const mockReadCall = jest.fn().mockResolvedValue('content') as any;

    readLocalFileFunction.memo = mockReadCall;
    fetchUrlFunction.memo = mockFetchCall;

    const result = await runWithOptions({ ...DEFAULT_OPTIONS, docsPaths: ['/app/project/documentation'], contextPath: '/app/project' }, () => loadFileFetch(pathUrl));

    expect(mockFetchCall).toHaveBeenCalledTimes(expectedIsFetch ? 1 : 0);
    expect(mockReadCall).toHaveBeenCalledTimes(expectedIsFetch ? 0 : 1);
    expect(result).toEqual({
      content: 'content',
      path: expect.any(String),
      resolvedPath: expect.any(String)
    });
  });
});

describe('promiseQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute promises in order', async () => {
    readLocalFileFunction.memo = jest.fn().mockImplementation(path => Promise.resolve(path)) as any;
    fetchUrlFunction.memo = jest.fn().mockImplementation(url => Promise.reject(url)) as any;

    const pathUrlQueue = ['dolor-sit.md', 'https://example.com/remote.md', 'lorem-ipsum.md'];

    await expect(promiseQueue(pathUrlQueue, { limit: 1 })).resolves.toMatchSnapshot('allSettled');
  });
});

describe('processDocsFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the memo functions
    readLocalFileFunction.memo = jest.fn().mockResolvedValue('local file content') as any;
    fetchUrlFunction.memo = jest.fn().mockResolvedValue('fetched content') as any;
  });

  it.each([
    {
      description: 'files and URLS',
      inputs: [
        'local-file.md',
        'https://example.com/remote.md'
      ],
      fileMemoHits: 1,
      fetchMemoHits: 1
    },
    {
      description: 'duplicate files and URLS',
      inputs: [
        'file.md',
        'file.md',
        'file.md',
        'https://example.com/remote.md',
        'https://example.com/remote.md'
      ],
      fileMemoHits: 1,
      fetchMemoHits: 1
    },
    {
      description: 'filter empty strings with varied input',
      inputs: [
        { doc: 'file.md' },
        'file.md',
        '',
        '   ',
        'file2.md'
      ],
      fileMemoHits: 2
    },
    {
      description: 'de-duplicate with first metadata',
      inputs: [
        { doc: 'file.md', lorem: 'ipsum' },
        { doc: 'file.md', dolor: 'sit' }
      ],
      fileMemoHits: 1
    },
    {
      description: 'metadata passthrough',
      inputs: [
        { doc: 'file.md', lorem: 'ispum', dolor: 'sit' }
      ],
      fileMemoHits: 1
    }
  ])('should process local and remote inputs, $description', async ({ inputs, fileMemoHits = 0, fetchMemoHits = 0 }) => {
    const result = await processDocsFunction(inputs, { loadLimit: 10 });

    expect(result).toMatchSnapshot();
    expect(readLocalFileFunction.memo).toHaveBeenCalledTimes(fileMemoHits);
    expect(fetchUrlFunction.memo).toHaveBeenCalledTimes(fetchMemoHits);
  });

  it('should handle errors gracefully', async () => {
    // Mock one success and one failure
    readLocalFileFunction.memo = jest.fn()
      .mockResolvedValueOnce('success content')
      .mockRejectedValueOnce(new Error('File not found')) as any;

    const inputs = [
      'good-file.md',
      'bad-file.md'
    ];

    const result = await processDocsFunction(inputs, { loadLimit: 10 });

    expect(result).toMatchSnapshot('errors');
  });
});

describe('processDocsFunction customization and settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readLocalFileFunction.memo = jest.fn().mockImplementation(async (path: string) => `content of ${path}`) as any;
    fetchUrlFunction.memo = jest.fn().mockImplementation(async (url: string) => `content of ${url}`) as any;
  });

  it.each([
    {
      description: 'respect custom loadLimit and truncate inputs',
      inputs: ['file1.md', 'file2.md', 'file3.md', 'file4.md'],
      settings: { loadLimit: 2 },
      expectedProcessedCount: 2,
      expectedPaths: ['file1.md', 'file2.md']
    },
    {
      description: 'handle loadLimit of 0',
      inputs: ['file1.md', 'file2.md'],
      settings: { loadLimit: 0 },
      expectedProcessedCount: 0,
      expectedPaths: []
    },
    {
      description: 'fallback to default settings when options are omitted',
      inputs: ['file1.md', 'file2.md'],
      settings: undefined,
      expectedProcessedCount: 2,
      expectedPaths: ['file1.md', 'file2.md']
    },
    {
      description: 'fallback to default loadLimit when settings is empty object',
      inputs: ['file1.md', 'file2.md'],
      settings: {},
      expectedProcessedCount: 2,
      expectedPaths: ['file1.md', 'file2.md']
    }
  ])('should handle custom settings, $description', async ({ inputs, settings, expectedProcessedCount, expectedPaths }) => {
    const result = await processDocsFunction(inputs, settings);

    expect(result).toHaveLength(expectedProcessedCount);
    expect(result.map(doc => doc.path)).toEqual(expectedPaths);
  });

  it.each([
    {
      description: 'forward custom parallelLoadLimit and parallelLoadThrottleMs to promiseQueue',
      settings: { parallelLoadLimit: 2, parallelLoadThrottleMs: 25 },
      inputs: ['file1.md', 'file2.md', 'file3.md']
    },
    {
      description: 'apply default parallel load options when not specified',
      settings: { loadLimit: 5 },
      inputs: ['file1.md', 'file2.md']
    }
  ])('should process items according to concurrency parameters, $description', async ({ settings, inputs }) => {
    const result = await processDocsFunction(inputs, settings);

    expect(result).toHaveLength(inputs.length);
    result.forEach(doc => {
      expect(doc.isSuccess).toBe(true);
    });
  });
});

describe('processDocsFunction.memo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    processDocsFunction.memo.clear();
    readLocalFileFunction.memo = jest.fn().mockImplementation(async (path: string) => `content of ${path}`) as any;
  });

  afterAll(() => {
    processDocsFunction.memo.clear();
  });

  it.each([
    {
      description: 'cache hits on identical arguments with distinct object references',
      call1: { inputs: ['file1.md', 'file2.md'], settings: { loadLimit: 5 } },
      call2: { inputs: ['file1.md', 'file2.md'], settings: { loadLimit: 5 } },
      expectedUnderlyingCalls: 2 // readLocalFileFunction called only for the first invocation
    },
    {
      description: 'cache hits regardless of property key order in settings object',
      call1: { inputs: ['file1.md'], settings: { loadLimit: 5, parallelLoadLimit: 2 } },
      call2: { inputs: ['file1.md'], settings: { parallelLoadLimit: 2, loadLimit: 5 } },
      expectedUnderlyingCalls: 1
    },
    {
      description: 'cache miss when loadLimit settings differ',
      call1: { inputs: ['file1.md', 'file2.md'], settings: { loadLimit: 1 } },
      call2: { inputs: ['file1.md', 'file2.md'], settings: { loadLimit: 2 } },
      expectedUnderlyingCalls: 3 // 1 item loaded in call 1 + 2 items loaded in call 2
    }
  ])('should handle memoization correctly, $description', async ({ call1, call2, expectedUnderlyingCalls }) => {
    const result1 = await processDocsFunction.memo(call1.inputs, call1.settings);
    const result2 = await processDocsFunction.memo(call2.inputs, call2.settings);

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(readLocalFileFunction.memo).toHaveBeenCalledTimes(expectedUnderlyingCalls);
  });

  it('should clear memoized entries on clear()', async () => {
    const inputs = ['file1.md'];

    await processDocsFunction.memo(inputs, { loadLimit: 5 });
    expect(readLocalFileFunction.memo).toHaveBeenCalledTimes(1);

    processDocsFunction.memo.clear();

    await processDocsFunction.memo(inputs, { loadLimit: 5 });
    expect(readLocalFileFunction.memo).toHaveBeenCalledTimes(2);
  });
});

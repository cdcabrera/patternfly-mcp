import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../../../package.json';
import {
  AI_HELPERS_ATTRIBUTION,
  AI_HELPERS_SEED_LICENSE,
  buildAiHelpersSeedCollection,
  createGitHubAiHelpersReader,
  describeAiHelpersModification,
  diffAiHelpersSeedCatalogs,
  flattenAiHelpersSeedRecords,
  generateReportCsv,
  isAiHelpersReseedNoOp,
  run,
  validateExistingAiHelpersSeed,
  type AiHelpersSeedCollection
} from '../update.aiHelpers';
import {
  MARKETPLACE_JSON_PATH,
  buildPinnedRawGitHubUrl,
  crawlAiHelpersCatalog,
  type AiHelpersBlobReadResult,
  type AiHelpersCatalogRecord,
  type AiHelpersGitTreeEntry,
  type AiHelpersRepositoryReader
} from '../aiHelpers';
import { getSrcPath, runUpdateTask, writeJsonCollection } from '../helpers';
import { saveCsvReport } from '../csv';

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn((path: string) =>
    (typeof path === 'string' && path.startsWith('/mock/')) || jest.requireActual('node:fs').existsSync(path))
}));

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  readFile: jest.fn()
}));

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  writeJsonCollection: jest.fn()
}));

jest.mock('../csv', () => ({
  ...jest.requireActual('../csv'),
  saveCsvReport: jest.fn()
}));

const FIXTURE_ROOT = resolve(fileURLToPath(new URL('../__fixtures__/aiHelpers', import.meta.url)));
const COMMIT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OUTPUT_PATH = '/mock/collection.aiHelpers.json';
const REPORT_PATH = '/mock/collection.aiHelpers.report.csv';

interface MockBlobDefinition {
  content: string;
  sha?: string;
}

class MockAiHelpersRepositoryReader implements AiHelpersRepositoryReader {
  private readonly blobs: Map<string, MockBlobDefinition>;
  private readonly tree: AiHelpersGitTreeEntry[];
  private readonly refMap: Map<string, string>;
  private readonly failReads: Set<string>;
  private resolveRefCalls = 0;

  constructor(options: {
    blobs: Map<string, MockBlobDefinition>;
    tree: AiHelpersGitTreeEntry[];
    refMap?: Map<string, string>;
    failReads?: Set<string>;
  }) {
    this.blobs = options.blobs;
    this.tree = options.tree;
    this.refMap = options.refMap || new Map([['main', COMMIT_SHA]]);
    this.failReads = options.failReads || new Set();
  }

  getResolveRefCalls(): number {
    return this.resolveRefCalls;
  }

  async resolveRef(ref: string): Promise<string> {
    this.resolveRefCalls += 1;
    const sha = this.refMap.get(ref);

    if (!sha) {
      throw new Error(`Unknown ref "${ref}"`);
    }

    return sha;
  }

  async listTree(): Promise<AiHelpersGitTreeEntry[]> {
    return [...this.tree];
  }

  async readBlob(_commitSha: string, path: string): Promise<AiHelpersBlobReadResult> {
    if (this.failReads.has(path)) {
      throw new Error(`read failed for ${path}`);
    }

    const blob = this.blobs.get(path);

    if (!blob) {
      throw new Error(`missing blob ${path}`);
    }

    return {
      path,
      sha: blob.sha || `blob-${path}`,
      size: Buffer.byteLength(blob.content, 'utf-8'),
      content: blob.content
    };
  }
}

const makeTreeEntry = (path: string): AiHelpersGitTreeEntry => ({
  path,
  type: 'blob',
  mode: '100644',
  sha: `tree-sha-${path}`,
  size: 200
});

const buildStandardDiscoveryTree = (): AiHelpersGitTreeEntry[] => [
  makeTreeEntry(MARKETPLACE_JSON_PATH),
  makeTreeEntry('README.md'),
  makeTreeEntry('plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md'),
  makeTreeEntry('plugins/patternfly/pf-react/skills/pf-quoted-description/SKILL.md'),
  makeTreeEntry('plugins/patternfly/pf-react/skills/pf-folded-description/SKILL.md'),
  makeTreeEntry('plugins/patternfly/pf-react/skills/pf-literal-description/SKILL.md'),
  makeTreeEntry('plugins/patternfly/skills/meta-overlap-skill/SKILL.md'),
  makeTreeEntry('plugins/uxd-assist/skills/uxd-research-helper/SKILL.md')
];

const buildStandardBlobs = (): Map<string, MockBlobDefinition> =>
  new Map<string, MockBlobDefinition>([
    [MARKETPLACE_JSON_PATH, { content: readFixtureSync('marketplace.json'), sha: 'marketplace-sha' }],
    ['README.md', { content: readFixtureSync('README.md'), sha: 'readme-sha' }],
    [
      'plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md',
      { content: readFixtureSync('skills/pf-standard.md'), sha: 'pf-standard-sha' }
    ],
    [
      'plugins/patternfly/pf-react/skills/pf-quoted-description/SKILL.md',
      { content: readFixtureSync('skills/pf-quoted.md'), sha: 'pf-quoted-sha' }
    ],
    [
      'plugins/patternfly/pf-react/skills/pf-folded-description/SKILL.md',
      { content: readFixtureSync('skills/pf-folded.md'), sha: 'pf-folded-sha' }
    ],
    [
      'plugins/patternfly/pf-react/skills/pf-literal-description/SKILL.md',
      { content: readFixtureSync('skills/pf-literal.md'), sha: 'pf-literal-sha' }
    ],
    [
      'plugins/patternfly/skills/meta-overlap-skill/SKILL.md',
      { content: readFixtureSync('skills/pf-meta-overlap.md'), sha: 'pf-meta-sha' }
    ],
    [
      'plugins/uxd-assist/skills/uxd-research-helper/SKILL.md',
      { content: readFixtureSync('skills/uxd-standard.md'), sha: 'uxd-standard-sha' }
    ]
  ]);

function readFixtureSync(relativePath: string): string {
  return readFileSync(resolve(FIXTURE_ROOT, relativePath), 'utf-8');
}

const baseRecord = (overrides: Partial<AiHelpersCatalogRecord> = {}): AiHelpersCatalogRecord => ({
  displayName: 'Example',
  description: 'Example description',
  pathSlug: 'ai-helpers-skill-example',
  section: 'skills',
  category: 'patternfly',
  source: 'rh-uxd/ai-helpers',
  path: buildPinnedRawGitHubUrl('rh-uxd', 'ai-helpers', COMMIT_SHA, 'plugins/patternfly/pf-react/skills/example/SKILL.md'),
  version: 'main',
  kind: 'skill',
  family: 'patternfly',
  plugin: 'pf-react',
  sourcePath: 'plugins/patternfly/pf-react/skills/example/SKILL.md',
  sourceBlobSha: 'blob-a',
  sourceContentHash: 'hash-a',
  ...overrides
});

const buildExistingSeed = (records: AiHelpersCatalogRecord[]): AiHelpersSeedCollection => {
  const crawl = {
    commitSha: COMMIT_SHA,
    requestedRef: 'main',
    records
  };

  return buildAiHelpersSeedCollection(crawl, 'rh-uxd', 'ai-helpers', '2026-01-01T00:00:00.000Z');
};

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockWriteJsonCollection = writeJsonCollection as jest.MockedFunction<typeof writeJsonCollection>;
const mockSaveCsvReport = saveCsvReport as jest.MockedFunction<typeof saveCsvReport>;

describe('update.aiHelpers package wiring', () => {
  it('exports run and registers the build:collections-ai-helpers npm script', () => {
    expect(typeof run).toBe('function');
    expect(packageJson.scripts['build:collections-ai-helpers']).toBe(
      'UPDATE_COLLECTIONS=true tsx ./tooling/collections/update.aiHelpers.ts'
    );
  });
});

describe('createGitHubAiHelpersReader', () => {
  const owner = 'rh-uxd';
  const repo = 'ai-helpers';

  it('resolves a ref once, rejects truncated trees, and reads blobs via SHA-pinned raw URLs', async () => {
    const fetchMock = jest.fn();
    const reader = createGitHubAiHelpersReader(owner, repo, fetchMock as unknown as typeof fetch);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sha: COMMIT_SHA })
    });
    await expect(reader.resolveRef('main')).resolves.toBe(COMMIT_SHA);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/${owner}/${repo}/commits/main`,
      expect.objectContaining({ headers: expect.any(Object) })
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ truncated: true, tree: [] })
    });
    await expect(reader.listTree(COMMIT_SHA, { recursive: true })).rejects.toThrow(/truncated recursive tree/);

    const skillPath = 'README.md';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        truncated: false,
        tree: [{ path: skillPath, mode: '100644', type: 'blob', sha: 'blob-readme', size: 12 }]
      })
    });
    await reader.listTree(COMMIT_SHA, { recursive: true });

    const rawUrl = buildPinnedRawGitHubUrl(owner, repo, COMMIT_SHA, skillPath);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => '# Readme'
    });
    const blob = await reader.readBlob(COMMIT_SHA, skillPath);

    expect(fetchMock).toHaveBeenCalledWith(rawUrl, expect.objectContaining({ headers: expect.any(Object) }));
    expect(blob.content).toBe('# Readme');
    expect(blob.sha).toBe('blob-readme');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('ai-helpers seed envelope helpers', () => {
  it('builds the docs-catalog envelope with metadata and Jeff Puzzo attribution', async () => {
    const reader = new MockAiHelpersRepositoryReader({
      blobs: buildStandardBlobs(),
      tree: buildStandardDiscoveryTree()
    });
    const crawl = await crawlAiHelpersCatalog(reader, { ref: 'main' });
    const seed = buildAiHelpersSeedCollection(crawl, 'rh-uxd', 'ai-helpers', '2026-11-10T00:00:00.000Z');
    const flat = flattenAiHelpersSeedRecords(seed);

    expect(seed).toMatchObject({
      version: 'main',
      generated: '2026-11-10T00:00:00.000Z',
      meta: {
        totalEntries: expect.any(Number),
        totalDocs: crawl.records.length,
        source: 'patternfly-mcp-ai-helpers',
        sourceRepository: 'rh-uxd/ai-helpers',
        requestedRef: 'main',
        resolvedCommitSha: COMMIT_SHA,
        license: AI_HELPERS_SEED_LICENSE,
        attribution: AI_HELPERS_ATTRIBUTION
      },
      docs: expect.any(Object)
    });
    expect(flat).toHaveLength(crawl.records.length);
    expect(seed.meta.totalDocs).toBe(flat.length);
  });

  it('rejects invalid existing seeds before a reseed write', () => {
    expect(() => validateExistingAiHelpersSeed({})).toThrow(/missing a version/);
    expect(() =>
      validateExistingAiHelpersSeed({
        version: 'main',
        generated: '2026-01-01T00:00:00.000Z',
        meta: { resolvedCommitSha: 'short' },
        docs: {}
      })).toThrow(/meta is missing/);
  });
});

describe('ai-helpers CSV diff reporting', () => {
  it('reports added, modified, removed, unchanged, and source-path relocation rows', () => {
    const previous = [
      baseRecord(),
      baseRecord({
        pathSlug: 'ai-helpers-skill-removed',
        sourcePath: 'plugins/patternfly/pf-react/skills/removed/SKILL.md'
      }),
      baseRecord({
        pathSlug: 'ai-helpers-skill-unchanged',
        sourcePath: 'plugins/patternfly/pf-react/skills/unchanged/SKILL.md',
        sourceContentHash: 'same-hash'
      })
    ];

    const next = [
      baseRecord({
        description: 'Updated description',
        sourceContentHash: 'hash-b',
        sourcePath: 'plugins/patternfly/pf-react/skills/relocated/SKILL.md',
        path: buildPinnedRawGitHubUrl(
          'rh-uxd',
          'ai-helpers',
          COMMIT_SHA,
          'plugins/patternfly/pf-react/skills/relocated/SKILL.md'
        )
      }),
      baseRecord({
        pathSlug: 'ai-helpers-skill-added',
        sourcePath: 'plugins/patternfly/pf-react/skills/added/SKILL.md'
      }),
      baseRecord({
        pathSlug: 'ai-helpers-skill-unchanged',
        sourcePath: 'plugins/patternfly/pf-react/skills/unchanged/SKILL.md',
        sourceContentHash: 'same-hash'
      })
    ];

    const diff = diffAiHelpersSeedCatalogs(previous, next);
    const csv = generateReportCsv(diff, previous);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toContain('pathSlug');
    expect(lines.some(line => line.startsWith('ADDED,'))).toBe(true);
    expect(lines.some(line => line.startsWith('REMOVED,'))).toBe(true);
    expect(lines.some(line => line.includes('relocation/rename'))).toBe(true);
    expect(lines.some(line => line.startsWith('UNCHANGED,'))).toBe(true);

    const reasons = describeAiHelpersModification(previous[0]!, next[0]!);

    expect(reasons.some(reason => reason.includes('relocation/rename'))).toBe(true);
  });
});

describe('update.aiHelpers run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockImplementation(path => path === OUTPUT_PATH);
    mockWriteJsonCollection.mockResolvedValue({
      jsonContent: '{}',
      sizeKb: '1.0',
      durationSec: '0.1'
    });
    mockSaveCsvReport.mockResolvedValue(undefined);
  });

  it('writes the seed and CSV report on the initial successful crawl', async () => {
    mockExistsSync.mockReturnValue(false);

    const reader = new MockAiHelpersRepositoryReader({
      blobs: buildStandardBlobs(),
      tree: buildStandardDiscoveryTree()
    });

    await run({
      outputPath: OUTPUT_PATH,
      csvOutputPath: REPORT_PATH,
      reader
    });

    expect(reader.getResolveRefCalls()).toBe(1);
    expect(mockWriteJsonCollection).toHaveBeenCalledTimes(1);
    expect(mockSaveCsvReport).toHaveBeenCalledTimes(1);
    const payload = mockWriteJsonCollection.mock.calls[0]?.[1] as AiHelpersSeedCollection;

    expect(payload.meta.attribution).toBe(AI_HELPERS_ATTRIBUTION);
    expect(payload.meta.resolvedCommitSha).toBe(COMMIT_SHA);
  });

  it('does not write JSON or CSV when resolved SHA and catalog are unchanged', async () => {
    const reader = new MockAiHelpersRepositoryReader({
      blobs: buildStandardBlobs(),
      tree: buildStandardDiscoveryTree()
    });
    const crawl = await crawlAiHelpersCatalog(reader, { ref: 'main' });
    const seed = buildExistingSeed(crawl.records);

    mockReadFile.mockResolvedValue(JSON.stringify(seed, null, 2) + '\n');

    const freshReader = new MockAiHelpersRepositoryReader({
      blobs: buildStandardBlobs(),
      tree: buildStandardDiscoveryTree()
    });

    const diff = await run({
      outputPath: OUTPUT_PATH,
      csvOutputPath: REPORT_PATH,
      reader: freshReader
    });

    expect(isAiHelpersReseedNoOp(seed, crawl, diff)).toBe(true);
    expect(mockWriteJsonCollection).not.toHaveBeenCalled();
    expect(mockSaveCsvReport).not.toHaveBeenCalled();
  });

  it('refuses to write when the existing seed is invalid', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 'main' }));

    const reader = new MockAiHelpersRepositoryReader({
      blobs: buildStandardBlobs(),
      tree: buildStandardDiscoveryTree()
    });

    await expect(run({ outputPath: OUTPUT_PATH, csvOutputPath: REPORT_PATH, reader })).rejects.toThrow(
      /Refusing to replace seed/
    );
    expect(mockWriteJsonCollection).not.toHaveBeenCalled();
    expect(mockSaveCsvReport).not.toHaveBeenCalled();
  });

  it('refuses to write when crawl validation fails after one valid and one failed admitted candidate', async () => {
    mockExistsSync.mockReturnValue(false);

    const blobs = buildStandardBlobs();
    const tree = [
      ...buildStandardDiscoveryTree(),
      makeTreeEntry('plugins/patternfly/pf-react/skills/failing-skill/SKILL.md')
    ];

    blobs.set('plugins/patternfly/pf-react/skills/failing-skill/SKILL.md', {
      content: readFixtureSync('skills/missing-name.md'),
      sha: 'bad-skill'
    });

    const reader = new MockAiHelpersRepositoryReader({ blobs, tree });

    await expect(run({ outputPath: OUTPUT_PATH, csvOutputPath: REPORT_PATH, reader })).rejects.toThrow(
      /failed validation/
    );
    expect(mockWriteJsonCollection).not.toHaveBeenCalled();
    expect(mockSaveCsvReport).not.toHaveBeenCalled();
  });

  it('does not invoke run when UPDATE_COLLECTIONS is unset', async () => {
    const originalEnv = process.env.UPDATE_COLLECTIONS;

    delete process.env.UPDATE_COLLECTIONS;
    const taskFn = jest.fn().mockResolvedValue(undefined);

    await runUpdateTask('AI Helpers collection', taskFn);

    expect(taskFn).not.toHaveBeenCalled();
    process.env.UPDATE_COLLECTIONS = originalEnv;
  });
});

describe('update.aiHelpers direct execution guard', () => {
  it('points getSrcPath at the collection.aiHelpers.json default output location', () => {
    const resolved = getSrcPath('collection.aiHelpers.json');

    expect(resolved.endsWith('src/collection.aiHelpers.json')).toBe(true);
  });
});

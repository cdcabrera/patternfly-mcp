import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKETPLACE_JSON_PATH,
  buildPinnedRawGitHubUrl,
  crawlAiHelpersCatalog,
  derivePluginRootsFromMarketplace,
  diffAiHelpersCatalogs,
  discoverSkillPaths,
  getUnsafePathReason,
  isStableSha,
  parseSkillFrontmatter,
  type AiHelpersBlobReadResult,
  type AiHelpersCatalogRecord,
  type AiHelpersGitTreeEntry,
  type AiHelpersRepositoryReader
} from '../aiHelpers';

const FIXTURE_ROOT = resolve(fileURLToPath(new URL('../__fixtures__/aiHelpers', import.meta.url)));
const COMMIT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const readFixture = async (relativePath: string): Promise<string> =>
  readFile(resolve(FIXTURE_ROOT, relativePath), 'utf-8');

interface MockBlobDefinition {
  content: string;
  sha?: string;
}

class MockAiHelpersRepositoryReader implements AiHelpersRepositoryReader {
  private readonly blobs: Map<string, MockBlobDefinition>;
  private readonly tree: AiHelpersGitTreeEntry[];
  private readonly refMap: Map<string, string>;
  private readonly failReads: Set<string>;
  private readonly readLog: string[] = [];

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

  getReadLog(): string[] {
    return [...this.readLog];
  }

  async resolveRef(ref: string): Promise<string> {
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
    this.readLog.push(path);

    if (this.failReads.has(path)) {
      throw new Error(`read failed for ${path}`);
    }

    const blob = this.blobs.get(path);

    if (!blob) {
      throw new Error(`missing blob ${path}`);
    }

    const content = blob.content;
    const sha = blob.sha || `blob-${path}`;

    return {
      path,
      sha,
      size: Buffer.byteLength(content, 'utf-8'),
      content
    };
  }
}

const makeTreeEntry = (
  path: string,
  overrides: Partial<AiHelpersGitTreeEntry> = {}
): AiHelpersGitTreeEntry => ({
  path,
  type: 'blob',
  mode: '100644',
  sha: `tree-sha-${path}`,
  size: 200,
  ...overrides
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

const buildStandardBlobs = async (): Promise<Map<string, MockBlobDefinition>> => {
  const marketplace = await readFixture('marketplace.json');

  return new Map<string, MockBlobDefinition>([
    [MARKETPLACE_JSON_PATH, { content: marketplace, sha: 'marketplace-sha' }],
    ['README.md', { content: await readFixture('README.md'), sha: 'readme-sha' }],
    [
      'plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md',
      { content: await readFixture('skills/pf-standard.md'), sha: 'pf-standard-sha' }
    ],
    [
      'plugins/patternfly/pf-react/skills/pf-quoted-description/SKILL.md',
      { content: await readFixture('skills/pf-quoted.md'), sha: 'pf-quoted-sha' }
    ],
    [
      'plugins/patternfly/pf-react/skills/pf-folded-description/SKILL.md',
      { content: await readFixture('skills/pf-folded.md'), sha: 'pf-folded-sha' }
    ],
    [
      'plugins/patternfly/pf-react/skills/pf-literal-description/SKILL.md',
      { content: await readFixture('skills/pf-literal.md'), sha: 'pf-literal-sha' }
    ],
    [
      'plugins/patternfly/skills/meta-overlap-skill/SKILL.md',
      { content: await readFixture('skills/pf-meta-overlap.md'), sha: 'pf-meta-sha' }
    ],
    [
      'plugins/uxd-assist/skills/uxd-research-helper/SKILL.md',
      { content: await readFixture('skills/uxd-standard.md'), sha: 'uxd-standard-sha' }
    ]
  ]);
};

describe('parseSkillFrontmatter', () => {
  it('parses ordinary, quoted, folded, and literal descriptions', async () => {
    const ordinary = await readFixture('skills/pf-standard.md');
    const quoted = await readFixture('skills/pf-quoted.md');
    const folded = await readFixture('skills/pf-folded.md');
    const literal = await readFixture('skills/pf-literal.md');

    expect(parseSkillFrontmatter(ordinary)).toEqual({
      name: 'pf-coding-standards',
      description: 'PatternFly React coding standards for components.'
    });
    expect(parseSkillFrontmatter(quoted).description).toBe('Quoted description for a PatternFly skill.');
    expect(parseSkillFrontmatter(folded).description).toContain('Folded YAML description');
    expect(parseSkillFrontmatter(literal).description).toContain('Literal block description');
  });

  it('rejects missing names and malformed YAML', async () => {
    const missingName = await readFixture('skills/missing-name.md');
    const malformed = await readFixture('skills/malformed-yaml.md');

    expect(() => parseSkillFrontmatter(missingName)).toThrow(/requires a non-empty name/);
    expect(() => parseSkillFrontmatter(malformed)).toThrow(/not valid YAML/);
  });
});

describe('buildPinnedRawGitHubUrl', () => {
  it('builds SHA-pinned raw URLs and rejects non-SHA refs', () => {
    const url = buildPinnedRawGitHubUrl('rh-uxd', 'ai-helpers', COMMIT_SHA, 'README.md');

    expect(url).toBe(
      `https://raw.githubusercontent.com/rh-uxd/ai-helpers/${COMMIT_SHA}/README.md`
    );
    expect(() => buildPinnedRawGitHubUrl('rh-uxd', 'ai-helpers', 'main', 'README.md')).toThrow(
      /40-character SHA/
    );
  });
});

describe('path safety and discovery helpers', () => {
  it('rejects traversal-like and blocked repository paths', () => {
    expect(getUnsafePathReason('../README.md')).toBe('path traversal');
    expect(getUnsafePathReason('.github/workflows/ci.yml')).toBe('blocked repository segment');
    expect(getUnsafePathReason('scripts/run.sh')).toBe('blocked repository segment');
    expect(getUnsafePathReason('AGENTS.md')).toBe('agent instruction document');
    expect(getUnsafePathReason('agent-docs/overview.md')).toBe('agent docs path');
  });

  it('discovers nested PatternFly and flat UXD skill paths with overlap deduplication', async () => {
    const marketplace = JSON.parse(await readFixture('marketplace.json'));
    const pluginRoots = derivePluginRootsFromMarketplace(marketplace);
    const tree = buildStandardDiscoveryTree();

    const discovered = discoverSkillPaths(tree, pluginRoots);
    const paths = [...discovered.keys()].sort();

    expect(paths).toContain('plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md');
    expect(paths).toContain('plugins/uxd-assist/skills/uxd-research-helper/SKILL.md');
    expect(discovered.get('plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md')?.name).toBe(
      'pf-react'
    );
    expect(discovered.get('plugins/patternfly/skills/meta-overlap-skill/SKILL.md')?.name).toBe('patternfly');
    expect(paths).toHaveLength(6);
  });
});

describe('crawlAiHelpersCatalog', () => {
  it('builds stable sorted catalog records with metadata and SHA-pinned URLs', async () => {
    const blobs = await buildStandardBlobs();
    const reader = new MockAiHelpersRepositoryReader({
      blobs,
      tree: buildStandardDiscoveryTree()
    });

    const result = await crawlAiHelpersCatalog(reader, { ref: 'main' });

    expect(result.commitSha).toBe(COMMIT_SHA);
    expect(result.records.map(record => record.pathSlug)).toEqual([
      'ai-helpers-skill-meta-overlap-skill',
      'ai-helpers-skill-pf-coding-standards',
      'ai-helpers-skill-pf-folded-description',
      'ai-helpers-skill-pf-literal-description',
      'ai-helpers-skill-pf-quoted-description',
      'ai-helpers-skill-uxd-research-helper',
      'uxd-ai-helpers-readme'
    ]);

    const pfSkill = result.records.find(record => record.pathSlug === 'ai-helpers-skill-pf-coding-standards');

    expect(pfSkill).toMatchObject({
      kind: 'skill',
      family: 'patternfly',
      plugin: 'pf-react',
      sourcePath: 'plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md',
      sourceBlobSha: 'pf-standard-sha'
    });
    expect(pfSkill?.path).toBe(
      buildPinnedRawGitHubUrl('rh-uxd', 'ai-helpers', COMMIT_SHA, pfSkill?.sourcePath || '')
    );
    expect(isStableSha(COMMIT_SHA)).toBe(true);

    const overview = result.records.find(record => record.pathSlug === 'uxd-ai-helpers-readme');

    expect(overview).toMatchObject({
      kind: 'overview',
      family: 'uxd',
      section: 'overview'
    });
  });

  it('rejects symlink, binary, oversize, and unapproved markdown paths', async () => {
    const marketplace = await readFixture('marketplace.json');
    const tree: AiHelpersGitTreeEntry[] = [
      makeTreeEntry(MARKETPLACE_JSON_PATH),
      makeTreeEntry('README.md'),
      makeTreeEntry('plugins/patternfly/pf-react/skills/rejected-skill/SKILL.md'),
      makeTreeEntry('CLAUDE.md'),
      makeTreeEntry('plugins/patternfly/pf-react/skills/binary-skill/SKILL.md'),
      makeTreeEntry('plugins/patternfly/pf-react/skills/symlink-skill/SKILL.md', {
        mode: '120000'
      }),
      makeTreeEntry('plugins/patternfly/pf-react/skills/oversize-skill/SKILL.md', {
        size: 600_000
      }),
      makeTreeEntry('plugins/uxd-unlisted/skills/unapproved-sidecar/SKILL.md')
    ];

    const blobs = new Map<string, MockBlobDefinition>([
      [MARKETPLACE_JSON_PATH, { content: marketplace }],
      ['README.md', { content: '# readme\n' }],
      [
        'plugins/patternfly/pf-react/skills/rejected-skill/SKILL.md',
        { content: await readFixture('skills/missing-name.md') }
      ],
      ['plugins/patternfly/pf-react/skills/binary-skill/SKILL.md', { content: 'binary\0content' }],
      [
        'plugins/uxd-unlisted/skills/unapproved-sidecar/SKILL.md',
        { content: '---\nname: sidecar\ndescription: nope\n---\n' }
      ]
    ]);

    const reader = new MockAiHelpersRepositoryReader({ blobs, tree });
    const result = await crawlAiHelpersCatalog(reader, { ref: 'main' });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.pathSlug).toBe('uxd-ai-helpers-readme');
  });

  it('rejects duplicate path slugs across admitted records', async () => {
    const marketplace = await readFixture('marketplace.json');
    const duplicateBody = await readFixture('skills/pf-standard.md');
    const tree: AiHelpersGitTreeEntry[] = [
      makeTreeEntry(MARKETPLACE_JSON_PATH),
      makeTreeEntry('README.md'),
      makeTreeEntry('plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md'),
      makeTreeEntry('plugins/patternfly/pf-react/skills/pf-coding-standards-copy/SKILL.md')
    ];

    const blobs = new Map<string, MockBlobDefinition>([
      [MARKETPLACE_JSON_PATH, { content: marketplace }],
      ['README.md', { content: '# readme\n' }],
      ['plugins/patternfly/pf-react/skills/pf-coding-standards/SKILL.md', { content: duplicateBody }],
      ['plugins/patternfly/pf-react/skills/pf-coding-standards-copy/SKILL.md', { content: duplicateBody }]
    ]);

    const reader = new MockAiHelpersRepositoryReader({ blobs, tree });
    const result = await crawlAiHelpersCatalog(reader, { ref: 'main' });

    expect(result.records.filter(record => record.kind === 'skill')).toHaveLength(1);
    expect(result.records.find(record => record.pathSlug === 'uxd-ai-helpers-readme')).toBeDefined();
  });

  it('returns overview-only results when every skill candidate is rejected', async () => {
    const marketplace = await readFixture('marketplace.json');
    const tree: AiHelpersGitTreeEntry[] = [
      makeTreeEntry(MARKETPLACE_JSON_PATH),
      makeTreeEntry('README.md'),
      makeTreeEntry('plugins/patternfly/pf-react/skills/bad-skill/SKILL.md')
    ];

    const blobs = new Map<string, MockBlobDefinition>([
      [MARKETPLACE_JSON_PATH, { content: marketplace }],
      ['README.md', { content: '# readme\n' }],
      ['plugins/patternfly/pf-react/skills/bad-skill/SKILL.md', { content: await readFixture('skills/missing-name.md') }]
    ]);

    const reader = new MockAiHelpersRepositoryReader({ blobs, tree });
    const result = await crawlAiHelpersCatalog(reader, { ref: 'main' });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.kind).toBe('overview');
  });

  it('surfaces reader failures and empty invalid crawls', async () => {
    const marketplace = await readFixture('marketplace.json');
    const tree: AiHelpersGitTreeEntry[] = [
      makeTreeEntry(MARKETPLACE_JSON_PATH),
      makeTreeEntry('plugins/patternfly/pf-react/skills/failing-skill/SKILL.md')
    ];

    const blobs = new Map<string, MockBlobDefinition>([[MARKETPLACE_JSON_PATH, { content: marketplace }]]);
    const reader = new MockAiHelpersRepositoryReader({
      blobs,
      tree,
      failReads: new Set(['plugins/patternfly/pf-react/skills/failing-skill/SKILL.md'])
    });

    await expect(crawlAiHelpersCatalog(reader, { ref: 'main' })).rejects.toThrow(/no catalog records/);

    await expect(
      crawlAiHelpersCatalog(
        {
          resolveRef: async () => COMMIT_SHA,
          listTree: async () => tree,
          readBlob: async () => {
            throw new Error('reader unavailable');
          }
        },
        { ref: 'main' }
      )
    ).rejects.toThrow(/reader unavailable|no catalog records/);
  });

  it('does not execute skill bodies and only reads repository blobs through the reader', async () => {
    const blobs = await buildStandardBlobs();
    const reader = new MockAiHelpersRepositoryReader({
      blobs,
      tree: buildStandardDiscoveryTree()
    });

    await crawlAiHelpersCatalog(reader, { ref: 'main' });

    const readPaths = reader.getReadLog();

    expect(readPaths.every(path => typeof path === 'string')).toBe(true);
    expect(readPaths).toContain(MARKETPLACE_JSON_PATH);
    expect(readPaths).not.toEqual(
      expect.arrayContaining(['require', 'child_process', 'node:child_process'])
    );
  });
});

describe('diffAiHelpersCatalogs', () => {
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

  it('classifies added, modified, removed, and unchanged records', () => {
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
        sourceContentHash: 'hash-b'
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

    const diff = diffAiHelpersCatalogs(previous, next);

    expect(diff.added.map(record => record.pathSlug)).toEqual(['ai-helpers-skill-added']);
    expect(diff.removed.map(record => record.pathSlug)).toEqual(['ai-helpers-skill-removed']);
    expect(diff.modified.map(record => record.pathSlug)).toEqual(['ai-helpers-skill-example']);
    expect(diff.unchanged.map(record => record.pathSlug)).toEqual(['ai-helpers-skill-unchanged']);
  });
});

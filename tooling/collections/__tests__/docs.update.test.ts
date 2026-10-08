import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { jest } from '@jest/globals';
import { type PatternFlyMcpDocsCatalog } from '../../../src/docs.embedded';
import {
  AI_GUIDELINE_ALIASES,
  DEFAULT_TRACKED_REPOS,
  PINNED_HISTORICAL_REFS,
  buildCsvReport,
  diffDocsManifests,
  diffEntitiesByKey,
  escapeCsvField,
  extractCommitHash,
  extractRepoInfo,
  fetchLatestRepoHashes,
  findApiRedundantDocs,
  formatCsv,
  generateDocsReportCsv,
  logDiffReport,
  recalculateManifestMetadata,
  resolveApiEndpointForAiDoc,
  resolveFromRoot,
  run
} from '../docs.update';

const DOCS_PATH = resolve(process.cwd(), 'src/docs.json');
const API_PATH = resolve(process.cwd(), 'src/collection.patternFlyApi.json');
const RECORDS_MAINT_DOCS_PATH = resolve(process.cwd(), 'records-maint/docs.json');

describe('collection.patternFlyDocs Script & Manifest Integrity', () => {
  it('should export the run function for programmatic invocation', () => {
    expect(typeof run).toBe('function');
  });

  it('should have a generated documentation manifest file', () => {
    expect(existsSync(DOCS_PATH)).toBe(true);
  });

  it('should have a consistent JSON schema and correct metadata counts', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const catalog: PatternFlyMcpDocsCatalog = JSON.parse(raw);

    expect(catalog).toMatchObject({
      version: expect.any(String),
      generated: expect.any(String),
      meta: {
        totalEntries: expect.any(Number),
        totalDocs: expect.any(Number),
        source: expect.any(String)
      },
      docs: expect.any(Object)
    });

    const totalEntries = Object.keys(catalog.docs).length;
    const totalDocs = Object.values(catalog.docs).reduce((acc, arr) => acc + arr.length, 0);

    expect(catalog.meta.totalEntries).toBe(totalEntries);
    expect(catalog.meta.totalDocs).toBe(totalDocs);
  });

  it('should have records that are properly formatted with key properties', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const catalog: PatternFlyMcpDocsCatalog = JSON.parse(raw);
    const sample = Object.values(catalog.docs).flatMap(docs => docs).slice(0, 50);

    expect(sample.length).toBeGreaterThan(0);
    for (const record of sample) {
      expect(typeof record.displayName).toBe('string');
      expect(typeof record.description).toBe('string');
      expect(typeof record.pathSlug).toBe('string');
      expect(typeof record.section).toBe('string');
      expect(typeof record.category).toBe('string');
      expect(typeof record.source).toBe('string');
      expect(typeof record.path).toBe('string');
      expect(typeof record.version).toBe('string');

      expect(record.path.startsWith('http')).toBe(true);
    }
  });
});

describe('collection.patternFlyDocs CSV Report Generator', () => {
  it('should correctly escape fields with commas, quotes, and newlines', () => {
    expect(escapeCsvField('normal')).toBe('normal');
    expect(escapeCsvField('with,comma')).toBe('"with,comma"');
    expect(escapeCsvField('with "quotes"')).toBe('"with ""quotes"""');
    expect(escapeCsvField('with\nnewline')).toBe('"with\nnewline"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
    expect(escapeCsvField(123)).toBe('123');
  });

  it('should sanitize formula injection characters by default', () => {
    expect(escapeCsvField('=SUM(1+1)')).toBe("'=SUM(1+1)");
    expect(escapeCsvField('+123')).toBe("'+123");
    expect(escapeCsvField('-456')).toBe("'-456");
    expect(escapeCsvField('@lookup')).toBe("'@lookup");
    expect(escapeCsvField('\ttabPrefix')).toBe("'\ttabPrefix");
    expect(escapeCsvField('\rreturnPrefix')).toBe('"\'\rreturnPrefix"');
  });

  it('should preserve raw formula characters when sanitizeFormulas is set to false', () => {
    expect(escapeCsvField('=SUM(1+1)', false)).toBe('=SUM(1+1)');
    expect(escapeCsvField('+123', false)).toBe('+123');
    expect(escapeCsvField('-456', false)).toBe('-456');
    expect(escapeCsvField('@lookup', false)).toBe('@lookup');
  });

  it('should format header and row lines into standard CSV', () => {
    const headers = ['col1', 'col2'];
    const rows = [
      ['val1', 'val2'],
      ['val3,with,comma', 'val4 "quoted"']
    ];

    const result = formatCsv(headers, rows);

    expect(result).toBe('col1,col2\nval1,val2\n"val3,with,comma","val4 ""quoted"""\n');
  });

  it('should produce a full structured CSV report for added, removed, modified, and unchanged records', () => {
    const diff = {
      added: [
        {
          category: 'React',
          record: {
            displayName: 'New Component',
            pathSlug: 'new-component',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31359c381c8152331575ca2481e3fe1ff/new.md',
            version: 'v6'
          } as any,
          reason: 'new upstream document',
          details: 'Discovered in release update'
        }
      ],
      removed: [
        {
          category: 'React',
          record: {
            displayName: 'Table Rules',
            pathSlug: 'table-rules',
            path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md',
            version: 'v6'
          } as any,
          reason: 'superseded by API collection',
          details: 'v6/AI/development-guidelines_table/text'
        }
      ],
      modified: [
        {
          category: 'Button',
          record: {
            displayName: 'Button Design',
            pathSlug: 'button-design',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31359c381c8152331575ca2481e3fe1ff/packages/v4/src/content/components/button.md',
            version: 'v6'
          } as any,
          previousRecord: {
            displayName: 'Button Design',
            pathSlug: 'button-design',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/9577561288bf28038102a0b1f3c8374d6c4c34a9/packages/v4/src/content/components/button.md',
            version: 'v6'
          } as any,
          reasons: ['hash update (9577561 -> 540bb0d)'],
          previousHash: '9577561288bf28038102a0b1f3c8374d6c4c34a9',
          newHash: '540bb0d31359c381c8152331575ca2481e3fe1ff'
        }
      ],
      unchanged: [
        {
          category: 'AIHelpers',
          record: {
            displayName: 'Contributing',
            pathSlug: 'uxd-ai-helpers-contributing',
            path: 'https://raw.githubusercontent.com/rh-uxd/uxd-ai-helpers/e8cca17430a8ccb062ed1878073165417a081b34/CONTRIBUTING.md',
            version: 'v6'
          } as any
        }
      ]
    };

    const csv = generateDocsReportCsv(diff);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('status,category,name,pathSlug,path,previousHash,newHash,reason,details');
    expect(lines.some(line => line.startsWith('ADDED,React,New Component,new-component') && line.includes('540bb0d31359c381c8152331575ca2481e3fe1ff'))).toBe(true);
    expect(lines.some(line => line.startsWith('REMOVED,React,Table Rules,table-rules') && line.includes('superseded by API collection'))).toBe(true);
    expect(lines.some(line => line.startsWith('MODIFIED,Button,Button Design,button-design') && line.includes('hash update'))).toBe(true);
    expect(lines.some(line => line.startsWith('UNCHANGED,AIHelpers,Contributing,uxd-ai-helpers-contributing'))).toBe(true);
  });
});

describe('API Deduplication Litmus Test (Regression Guard)', () => {
  it('correctly detects the 20 redundant AI-helper entries when cross-referenced with API seed', () => {
    // If records-maint/docs.json (341 full records) exists, run full litmus test against it
    if (existsSync(RECORDS_MAINT_DOCS_PATH)) {
      const rawFullDocs = readFileSync(RECORDS_MAINT_DOCS_PATH, 'utf-8');
      const rawApi = readFileSync(API_PATH, 'utf-8');
      const fullDocs: PatternFlyMcpDocsCatalog = JSON.parse(rawFullDocs);
      const apiCatalog = JSON.parse(rawApi);

      const redundant = findApiRedundantDocs(fullDocs, apiCatalog.records);

      // Assert exactly 20 redundant AI-helper records are detected
      expect(redundant.length).toBe(20);

      // Verify specific known items are flagged with correct reasons and endpoint details
      const tableRules = redundant.find(item => item.record.pathSlug === 'table-rules' || item.record.displayName === 'Table Rules');

      expect(tableRules).toBeDefined();
      expect(tableRules?.reason).toBe('superseded by API collection');
      expect(tableRules?.details).toBe('v6/AI/development-guidelines_table/text');

      const chartsRules = redundant.find(item => item.record.displayName === 'React Charts');

      expect(chartsRules).toBeDefined();
      expect(chartsRules?.details).toBe('v6/AI/development-guidelines_charts/text');

      const chatbotRules = redundant.find(item => item.record.displayName === 'React Chatbot');

      expect(chatbotRules).toBeDefined();
      expect(chatbotRules?.details).toBe('v6/AI/development-guidelines_chatbot/text');

      const quickStart = redundant.find(
        item => item.record.pathSlug === 'quick-start' || item.record.displayName === 'Quick Start'
      );

      expect(quickStart).toBeDefined();
      expect(quickStart?.details).toBe('v6/AI/development-guidelines_quick-start/text');

      const commonIssues = redundant.find(
        item => item.record.pathSlug === 'troubleshooting' || item.record.displayName === 'React Troubleshooting'
      );

      expect(commonIssues).toBeDefined();
      expect(commonIssues?.details).toBe('v6/AI/development-guidelines_common-issues/text');

      const readmeMarketplace = redundant.find(item => item.record.pathSlug === 'ai-helpers-readme');

      expect(readmeMarketplace).toBeDefined();
      expect(readmeMarketplace?.details).toBe('v6/AI/ai-assisted-development_marketplace/text');
    }
  });

  it('preserves the 6 core root AIHelpers guides and ecosystem packages from removal (negative control)', () => {
    const rawDocs = readFileSync(DOCS_PATH, 'utf-8');
    const rawApi = readFileSync(API_PATH, 'utf-8');
    const docs: PatternFlyMcpDocsCatalog = JSON.parse(rawDocs);
    const apiCatalog = JSON.parse(rawApi);

    const redundant = findApiRedundantDocs(docs, apiCatalog.records);
    const redundantPaths = new Set(redundant.map(item => item.record.path));

    // 1. Core AIHelpers root repository guides must not be in redundant set
    const rootAiHelpers = docs.docs['AIHelpers'] || [];

    expect(rootAiHelpers.length).toBeGreaterThanOrEqual(6);
    for (const doc of rootAiHelpers) {
      expect(redundantPaths.has(doc.path)).toBe(false);
    }

    // 2. Ecosystem packages must not be in redundant set
    const ecosystemKeys = ['CLIDocumentation', 'ElementsDocumentation', 'McpDocumentation', 'CodemodsDocumentation'];

    for (const key of ecosystemKeys) {
      const items = docs.docs[key] || [];

      for (const item of items) {
        expect(redundantPaths.has(item.path)).toBe(false);
      }
    }
  });

  it('prunes redundant records and updates hashes correctly in recalculateManifestMetadata', () => {
    const mockCatalog: PatternFlyMcpDocsCatalog = {
      version: '1',
      generated: '2026-01-01T00:00:00.000Z',
      meta: {
        totalEntries: 2,
        totalDocs: 3,
        source: 'test'
      },
      docs: {
        React: [
          {
            displayName: 'Active Doc',
            description: 'Desc',
            pathSlug: 'active-doc',
            section: 'sec',
            category: 'React',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/oldhash/doc.md',
            version: 'v6'
          },
          {
            displayName: 'Table Rules',
            description: 'Desc',
            pathSlug: 'table-rules',
            section: 'sec',
            category: 'React',
            source: 'github',
            path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md',
            version: 'v6'
          }
        ],
        AIHelpers: [
          {
            displayName: 'Contributing',
            description: 'Desc',
            pathSlug: 'uxd-ai-helpers-contributing',
            section: 'sec',
            category: 'AIHelpers',
            source: 'github',
            path: 'https://raw.githubusercontent.com/rh-uxd/uxd-ai-helpers/e8cca17430a8ccb062ed1878073165417a081b34/CONTRIBUTING.md',
            version: 'v6'
          }
        ]
      }
    };

    const redundantRecords = [
      {
        category: 'React',
        record: mockCatalog.docs.React![1]!,
        reason: 'superseded by API collection',
        details: 'v6/AI/development-guidelines_table/text'
      }
    ];

    const latestHashes = new Map([
      ['patternfly/patternfly-org', 'neworgsha1234567890'],
      ['rh-uxd/uxd-ai-helpers', 'newaihelperssha1234567890']
    ]);

    const updated = recalculateManifestMetadata(mockCatalog, {
      redundantRecords,
      latestHashes
    });

    // Verify Table Rules was pruned
    expect(updated.docs.React?.length).toBe(1);
    expect(updated.docs.React?.[0]?.displayName).toBe('Active Doc');
    // Verify commit hash was updated for Active Doc
    expect(updated.docs.React?.[0]?.path).toBe(
      'https://raw.githubusercontent.com/patternfly/patternfly-org/neworgsha1234567890/doc.md'
    );

    // Verify pinned hash for AIHelpers was preserved
    expect(updated.docs.AIHelpers?.[0]?.path).toBe(
      'https://raw.githubusercontent.com/rh-uxd/uxd-ai-helpers/e8cca17430a8ccb062ed1878073165417a081b34/CONTRIBUTING.md'
    );

    // Verify recalculated metadata counts
    expect(updated.meta.totalEntries).toBe(2);
    expect(updated.meta.totalDocs).toBe(2);
  });

  it('correctly categorizes added, removed, modified, and unchanged in diffDocsManifests', () => {
    const oldCatalog: PatternFlyMcpDocsCatalog = {
      version: '1',
      generated: '2026-01-01T00:00:00.000Z',
      meta: { totalEntries: 1, totalDocs: 2, source: 'test' },
      docs: {
        Cat: [
          {
            displayName: 'Doc A',
            description: 'Desc A',
            pathSlug: 'doc-a',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash1111111111111111111111111111111111111111/a.md',
            version: 'v6'
          },
          {
            displayName: 'Doc B',
            description: 'Desc B',
            pathSlug: 'doc-b',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash1111111111111111111111111111111111111111/b.md',
            version: 'v6'
          }
        ]
      }
    };

    const newCatalog: PatternFlyMcpDocsCatalog = {
      version: '1',
      generated: '2026-01-02T00:00:00.000Z',
      meta: { totalEntries: 1, totalDocs: 2, source: 'test' },
      docs: {
        Cat: [
          {
            displayName: 'Doc A',
            description: 'Desc A',
            pathSlug: 'doc-a',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash2222222222222222222222222222222222222222/a.md', // modified hash
            version: 'v6'
          },
          {
            displayName: 'Doc C',
            description: 'Desc C',
            pathSlug: 'doc-c',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash2222222222222222222222222222222222222222/c.md',
            version: 'v6'
          }
        ]
      }
    };

    const diff = diffDocsManifests(oldCatalog, newCatalog);

    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0]?.record.displayName).toBe('Doc A');
    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0]?.record.displayName).toBe('Doc B');
    expect(diff.added.length).toBe(1);
    expect(diff.added[0]?.record.displayName).toBe('Doc C');
  });

  it('should define tracked default repositories', () => {
    expect(DEFAULT_TRACKED_REPOS.length).toBeGreaterThan(0);
    expect(DEFAULT_TRACKED_REPOS.some(repo => repo.repo === 'patternfly-org')).toBe(true);
    expect(DEFAULT_TRACKED_REPOS.some(repo => repo.repo === 'patternfly-react')).toBe(true);
  });

  it('should correctly parse repository info and commit hashes from raw GitHub URLs', () => {
    const rawUrl =
      'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31359c381c8152331575ca2481e3fe1ff/packages/v4/src/content/components/button.md';

    const info = extractRepoInfo(rawUrl);

    expect(info).toEqual({
      owner: 'patternfly',
      repo: 'patternfly-org',
      ref: '540bb0d31359c381c8152331575ca2481e3fe1ff',
      filePath: 'packages/v4/src/content/components/button.md'
    });

    const hash = extractCommitHash(rawUrl);

    expect(hash).toBe('540bb0d31359c381c8152331575ca2481e3fe1ff');

    expect(extractRepoInfo('invalid-url')).toBeNull();
    expect(extractCommitHash('invalid-url')).toBeNull();
  });

  it('should maintain declarative pinned historical hashes and guideline aliases', () => {
    expect(PINNED_HISTORICAL_REFS instanceof Set).toBe(true);
    expect(PINNED_HISTORICAL_REFS.has('ec02b437ec72b6e4cc4e28524516288f4acf9fdf')).toBe(true);
    expect(PINNED_HISTORICAL_REFS.has('e8cca17430a8ccb062ed1878073165417a081b34')).toBe(true);

    expect(AI_GUIDELINE_ALIASES['table-rules']).toBe('table');
    expect(AI_GUIDELINE_ALIASES['layout-components']).toBe('layout');
    expect(AI_GUIDELINE_ALIASES['development-rules']).toBe('overview');
  });

  it('should resolve AI helper documentation endpoints using aliases and token matching', () => {
    const highQualityApi = [
      { p: 'v6/AI/ai-assisted-development_marketplace/text', q: 1 },
      { p: 'v6/AI/development-guidelines_overview/text', q: 1 },
      { p: 'v6/AI/development-guidelines_table/text', q: 1 },
      { p: 'v6/AI/development-guidelines_charts/text', q: 1 }
    ];

    // 1. Root marketplace docs
    expect(
      resolveApiEndpointForAiDoc(
        {
          displayName: 'AI Helpers README',
          pathSlug: 'ai-helpers-readme',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/README.md',
          version: 'v6',
          category: 'AI',
          description: '',
          section: '',
          source: 'github'
        },
        highQualityApi
      )
    ).toBe('v6/AI/ai-assisted-development_marketplace/text');

    // 2. Guideline aliases (e.g. table-rules -> table)
    expect(
      resolveApiEndpointForAiDoc(
        {
          displayName: 'Table Rules',
          pathSlug: 'table-rules',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md',
          version: 'v6',
          category: 'React',
          description: '',
          section: '',
          source: 'github'
        },
        highQualityApi
      )
    ).toBe('v6/AI/development-guidelines_table/text');

    // 3. Direct match
    expect(
      resolveApiEndpointForAiDoc(
        {
          displayName: 'Charts Rules',
          pathSlug: 'charts',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/charts/README.md',
          version: 'v6',
          category: 'Charts',
          description: '',
          section: '',
          source: 'github'
        },
        highQualityApi
      )
    ).toBe('v6/AI/development-guidelines_charts/text');
  });
});

describe('Shared collections.helpers & Diff Utilities', () => {
  it('should resolve paths relative to project root with resolveFromRoot', () => {
    const resolved = resolveFromRoot('src', 'docs.json');

    expect(resolved).toBe(resolve(process.cwd(), 'src/docs.json'));
  });

  it('should perform generic entity diffing with diffEntitiesByKey', () => {
    const oldItems = [
      { id: '1', name: 'Alpha', version: 'v1' },
      { id: '2', name: 'Beta', version: 'v1' },
      { id: '3', name: 'Gamma', version: 'v1' }
    ];

    const newItems = [
      { id: '1', name: 'Alpha', version: 'v1' }, // unchanged
      { id: '2', name: 'Beta Updated', version: 'v2' }, // modified
      { id: '4', name: 'Delta', version: 'v1' } // added
      // id: 3 removed
    ];

    const diff = diffEntitiesByKey(
      oldItems,
      newItems,
      item => item.id,
      [
        'name',
        {
          field: 'version',
          label: 'version',
          formatChange: (oldVal: unknown, newVal: unknown) => `version updated from ${String(oldVal)} to ${String(newVal)}`
        }
      ]
    );

    expect(diff.added.length).toBe(1);
    expect(diff.added[0]?.id).toBe('4');

    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0]?.item.id).toBe('3');

    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0]?.newItem.id).toBe('2');
    expect(diff.modified[0]?.reasons).toContain('name (Beta -> Beta Updated)');
    expect(diff.modified[0]?.reasons).toContain('version updated from v1 to v2');

    expect(diff.unchanged.length).toBe(1);
    expect(diff.unchanged[0]?.id).toBe('1');
  });

  it('should build formatted CSV reports with buildCsvReport', () => {
    const csv = buildCsvReport({
      headers: ['header1', 'header2'],
      rows: [['val1', 'val2']]
    });

    expect(csv).toBe('header1,header2\nval1,val2\n');
  });

  it('should execute logDiffReport console logger without errors', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    logDiffReport({ added: [], removed: [], modified: [], unchanged: [] });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No record additions'));

    logDiffReport({
      added: [
        {
          category: 'Cat',
          record: { displayName: 'Doc A', pathSlug: 'doc-a', path: 'p', version: 'v6' } as any
        }
      ],
      removed: [
        {
          category: 'Cat',
          record: { displayName: 'Doc B', pathSlug: 'doc-b', path: 'p', version: 'v6' } as any,
          reason: 'retired'
        }
      ],
      modified: [
        {
          category: 'Cat',
          record: { displayName: 'Doc C', pathSlug: 'doc-c', path: 'p', version: 'v6' } as any,
          reasons: ['hash update']
        }
      ],
      unchanged: []
    });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Added (1)'));

    consoleSpy.mockRestore();
  });

  it('should concurrently query GitHub commit hashes with fetchLatestRepoHashes', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
      if (String(url).includes('patternfly-org')) {
        return {
          ok: true,
          json: async () => ({ sha: 'mocked-org-sha-123' })
        } as Response;
      }

      return {
        ok: false,
        status: 500
      } as Response;
    });

    const hashes = await fetchLatestRepoHashes(
      [
        { owner: 'patternfly', repo: 'patternfly-org', branch: 'main' },
        { owner: 'patternfly', repo: 'patternfly-react', branch: 'main' }
      ],
      2
    );

    expect(hashes.get('patternfly/patternfly-org')).toBe('mocked-org-sha-123');
    expect(hashes.get('patternfly-org')).toBe('mocked-org-sha-123');

    mockFetch.mockRestore();
  });
});

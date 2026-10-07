import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type PatternFlyMcpDocsCatalog } from '../../../src/docs.embedded';
import {
  AI_GUIDELINE_ALIASES,
  DEFAULT_TRACKED_REPOS,
  PINNED_HISTORICAL_REFS,
  diffDocsManifests,
  escapeCsvField,
  extractCommitHash,
  extractRepoInfo,
  findApiRedundantDocs,
  formatCsv,
  generateDocsReportCsv,
  recalculateManifestMetadata,
  resolveApiEndpointForAiDoc,
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

  it('should produce a full structured CSV report for added, removed, modified, and unchanged doc entries', () => {
    const diff = {
      added: [
        {
          category: 'NewCat',
          record: {
            displayName: 'New Doc',
            description: 'New Description',
            pathSlug: 'new-doc',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/831257aa7c49c3238e0f7afbb7cf219c62cd9e23/README.md',
            version: 'v6'
          },
          reason: 'new upstream document',
          details: 'Discovered in manifest update'
        }
      ],
      removed: [
        {
          category: 'React',
          record: {
            displayName: 'Table Rules',
            description: 'Old Table Rules',
            pathSlug: 'table-rules',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/ai-helpers/f7f8160c3f28b0bc7f64181d9466a425ac8329fc/docs/components/data-display/table.md',
            version: 'v6'
          },
          reason: 'superseded by API collection',
          details: 'v6/AI/development-guidelines_table/text'
        }
      ],
      modified: [
        {
          category: 'Button',
          record: {
            displayName: 'Button Design',
            description: 'Button design guidelines',
            pathSlug: 'button-design',
            section: 'components',
            category: 'design-guidelines',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Button.md',
            version: 'v6'
          },
          reasons: ['hash update (9577561 -> 540bb0d)'],
          previousHash: '957756128e8ddfc4be5db49e72312a2c43b9d220',
          newHash: '540bb0d31cb18670dd02857f80aa8b444fed9be9'
        }
      ],
      unchanged: [
        {
          category: 'Alert',
          record: {
            displayName: 'Alert Design',
            description: 'Alert design guidelines',
            pathSlug: 'alert-design',
            section: 'components',
            category: 'design-guidelines',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Alert.md',
            version: 'v6'
          }
        }
      ]
    };

    const csv = generateDocsReportCsv(diff);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('status,category,name,pathSlug,path,previousHash,newHash,reason,details');
    expect(lines.some(line => line.startsWith('ADDED,NewCat,New Doc') && line.includes('new upstream document'))).toBe(true);
    expect(lines.some(line => line.startsWith('REMOVED,React,Table Rules') && line.includes('superseded by API collection'))).toBe(true);
    expect(lines.some(line => line.startsWith('MODIFIED,Button,Button Design') && line.includes('hash update'))).toBe(true);
    expect(lines.some(line => line.startsWith('UNCHANGED,Alert,Alert Design'))).toBe(true);
  });
});

describe('API Deduplication Litmus Test (Regression Guard)', () => {
  it('correctly detects all 20 redundant AI-helper entries when cross-referenced with API seed', () => {
    // Read catalog containing pre-prune ai-helpers docs
    const sourcePath = existsSync(RECORDS_MAINT_DOCS_PATH) ? RECORDS_MAINT_DOCS_PATH : DOCS_PATH;
    const rawDocs = readFileSync(sourcePath, 'utf-8');
    const rawApi = readFileSync(API_PATH, 'utf-8');
    const docs = JSON.parse(rawDocs);
    const api = JSON.parse(rawApi);

    const redundant = findApiRedundantDocs(docs, api.records);

    // If source catalog has the 341 entries with 20 ai-helpers
    if (docs.meta.totalDocs >= 341) {
      expect(redundant.length).toBe(20);

      // Verify specific known entries are present
      expect(redundant.some(report => report.record.displayName === 'Table Rules')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'React Charts')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'React Chatbot')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'AI Prompt Guidance')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Styling Standards')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'PatternFly React Development Rules')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'React Guidelines')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'React Setup')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Development Environment')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Quick Start')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'External Links')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'React Troubleshooting')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Component Architecture')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Quick Deployment Guide for Prototypes')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Component Groups')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Data Display')).toBe(true);
      expect(redundant.some(report => report.record.displayName === 'Layout Components')).toBe(true);
      expect(redundant.some(report => report.record.pathSlug === 'ai-helpers-readme')).toBe(true);
      expect(redundant.some(report => report.record.pathSlug === 'ai-helpers-contributing')).toBe(true);
      expect(redundant.some(report => report.record.pathSlug === 'ai-helpers-contributing-skills')).toBe(true);
    } else {
      // In pruned catalog, redundant records have already been pruned
      expect(redundant.length).toBe(0);
    }
  });

  it('preserves the 6 core root AIHelpers guides and ecosystem repositories without false positives', () => {
    const rawDocs = readFileSync(DOCS_PATH, 'utf-8');
    const rawApi = readFileSync(API_PATH, 'utf-8');
    const docs = JSON.parse(rawDocs);
    const api = JSON.parse(rawApi);

    const redundant = findApiRedundantDocs(docs, api.records);
    const redundantPaths = new Set(redundant.map(report => report.record.path));

    // Ensure root AIHelpers repository guides are never flagged
    const rootAiHelpers = docs.docs['AIHelpers'] || [];

    for (const item of rootAiHelpers) {
      if (item.pathSlug.startsWith('uxd-ai-helpers-')) {
        expect(redundantPaths.has(item.path)).toBe(false);
      }
    }

    // Ensure ecosystem repositories are never flagged
    for (const entries of Object.values(docs.docs as Record<string, any[]>)) {
      for (const item of entries) {
        if (
          item.path.includes('/patternfly-cli/') ||
          item.path.includes('/patternfly-elements/') ||
          item.path.includes('/patternfly-mcp/') ||
          item.path.includes('/pf-codemods/')
        ) {
          expect(redundantPaths.has(item.path)).toBe(false);
        }
      }
    }
  });
});

describe('Helper Utilities & Manifest Recalculation', () => {
  it('should extract commit hashes and repository info correctly', () => {
    const url =
      'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/packages/documentation-site/patternfly-docs/content/AI/ai.md';
    const hash = extractCommitHash(url);
    const repoInfo = extractRepoInfo(url);

    expect(hash).toBe('540bb0d31cb18670dd02857f80aa8b444fed9be9');
    expect(repoInfo).toEqual({
      owner: 'patternfly',
      repo: 'patternfly-org',
      ref: '540bb0d31cb18670dd02857f80aa8b444fed9be9',
      filePath: 'packages/documentation-site/patternfly-docs/content/AI/ai.md'
    });

    expect(extractCommitHash('https://example.com/invalid')).toBeNull();
    expect(extractRepoInfo('https://example.com/invalid')).toBeNull();
  });

  it('should recalculate manifest metadata totalEntries and totalDocs accurately', () => {
    const sampleCatalog: PatternFlyMcpDocsCatalog = {
      version: '1',
      generated: '2026-01-01T00:00:00.000Z',
      meta: {
        totalEntries: 2,
        totalDocs: 3,
        source: 'patternfly-mcp'
      },
      docs: {
        Button: [
          {
            displayName: 'Button 1',
            description: 'Desc 1',
            pathSlug: 'button-1',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/1111111111111111111111111111111111111111/Button.md',
            version: 'v6'
          },
          {
            displayName: 'Button 2',
            description: 'Desc 2',
            pathSlug: 'button-2',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/1111111111111111111111111111111111111111/Button2.md',
            version: 'v6'
          }
        ],
        Alert: [
          {
            displayName: 'Alert 1',
            description: 'Desc alert',
            pathSlug: 'alert-1',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/2222222222222222222222222222222222222222/Alert.md',
            version: 'v6'
          }
        ]
      }
    };

    const latestHashes = new Map([
      ['patternfly/patternfly-react', '3333333333333333333333333333333333333333']
    ]);

    const updated = recalculateManifestMetadata(sampleCatalog, { latestHashes });

    expect(updated.meta.totalEntries).toBe(2);
    expect(updated.meta.totalDocs).toBe(3);
    expect(updated.docs.Button?.[0]?.path).toContain('3333333333333333333333333333333333333333');
    expect(updated.docs.Alert?.[0]?.path).toContain('2222222222222222222222222222222222222222');
  });

  it('should diff manifests and categorize added, removed, modified, and unchanged entries', () => {
    const oldCatalog: PatternFlyMcpDocsCatalog = {
      meta: { totalEntries: 2, totalDocs: 2, source: 'test' },
      docs: {
        Cat1: [
          {
            displayName: 'Doc A',
            description: 'Desc A',
            pathSlug: 'doc-a',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash1111111111111111111111111111111111111111/a.md',
            version: 'v6'
          }
        ],
        Cat2: [
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
      meta: { totalEntries: 2, totalDocs: 2, source: 'test' },
      docs: {
        Cat1: [
          {
            displayName: 'Doc A',
            description: 'Desc A',
            pathSlug: 'doc-a',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash2222222222222222222222222222222222222222/a.md',
            version: 'v6'
          }
        ],
        Cat3: [
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

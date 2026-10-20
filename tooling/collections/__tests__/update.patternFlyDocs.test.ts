import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type PatternFlyMcpDocsCatalog } from '../../../src/docs.embedded';
import {
  DEFAULT_API_FILENAME,
  DEFAULT_DOCS_FILENAME,
  logDiffReport,
  run
} from '../update.patternFlyDocs';
import { fetchLatestRepoHashes, getSrcPath, writeJsonCollection } from '../helpers';
import { saveCsvReport } from '../csv';
import { findApiRedundantDocs, type DocsDiffResult } from '../update.patternFlyDocsHelpers';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  readFile: jest.fn()
}));

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  fetchLatestRepoHashes: jest.fn(),
  writeJsonCollection: jest.fn()
}));

jest.mock('../csv', () => ({
  ...jest.requireActual('../csv'),
  saveCsvReport: jest.fn()
}));

const DOCS_PATH = getSrcPath(DEFAULT_DOCS_FILENAME);
const API_PATH = getSrcPath(DEFAULT_API_FILENAME);
const RECORDS_MAINT_DOCS_PATH = resolve(process.cwd(), `records-maint/${DEFAULT_DOCS_FILENAME}`);
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteJsonCollection = writeJsonCollection as jest.MockedFunction<typeof writeJsonCollection>;

describe('collection.patternFlyDocs', () => {
  it('should export the run function for programmatic invocation', () => {
    expect(typeof run).toBe('function');
  });

  it('should have a generated documentation manifest file', () => {
    expect(existsSync(DOCS_PATH)).toBe(true);
  });

  it('should have a consistent JSON schema and correct metadata counts', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const collection: PatternFlyMcpDocsCatalog = JSON.parse(raw);

    expect(collection).toMatchObject({
      version: expect.any(String),
      generated: expect.any(String),
      meta: {
        totalEntries: expect.any(Number),
        totalDocs: expect.any(Number),
        source: expect.any(String)
      },
      docs: expect.any(Object)
    });

    const totalEntries = Object.keys(collection.docs).length;
    const totalDocs = Object.values(collection.docs).reduce((acc, arr) => acc + arr.length, 0);

    expect(collection.meta.totalEntries).toBe(totalEntries);
    expect(collection.meta.totalDocs).toBe(totalDocs);
  });

  it('should have records that are properly formatted with key properties', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const collection: PatternFlyMcpDocsCatalog = JSON.parse(raw);
    const sample = Object.values(collection.docs).flatMap(docs => docs).slice(0, 50);

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

describe('logDiffReport', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log structured diff summary with formatted additions, removals, and modifications', () => {
    const sampleDiff: DocsDiffResult = {
      added: [
        {
          category: 'Components',
          record: {
            displayName: 'Button',
            pathSlug: 'button',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/sha/button.md',
            category: 'react',
            description: '',
            section: 'components',
            source: 'github',
            version: 'v6'
          }
        }
      ],
      removed: [
        {
          category: 'AI',
          record: {
            displayName: 'Table Rules',
            pathSlug: 'table-rules',
            path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/sha/table.md',
            category: 'AI',
            description: '',
            section: 'guidelines',
            source: 'github',
            version: 'v6'
          },
          reason: 'superseded by API collection',
          details: 'v6/AI/development-guidelines_table/text'
        }
      ],
      modified: [
        {
          category: 'Alert',
          record: {
            displayName: 'Alert',
            pathSlug: 'alert',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/new/alert.md',
            category: 'react',
            description: '',
            section: 'components',
            source: 'github',
            version: 'v6'
          },
          reasons: ['hash update (old -> new)']
        }
      ],
      unchanged: []
    };

    logDiffReport(sampleDiff);

    expect(consoleSpy).toHaveBeenCalledWith('\n📊 PatternFly Docs Collection Diff Report:');
  });
});

describe('run', () => {
  const mockCatalog: PatternFlyMcpDocsCatalog = {
    version: '1',
    generated: '2026-01-01T00:00:00.000Z',
    meta: { totalEntries: 1, totalDocs: 1, source: 'patternfly-mcp' },
    docs: {
      Button: [
        {
          displayName: 'Button',
          pathSlug: 'button',
          path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/1111111111111111111111111111111111111111/button.md',
          version: 'v6',
          category: 'react',
          description: '',
          section: 'components',
          source: 'github'
        }
      ]
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(JSON.stringify(mockCatalog));
    (fetchLatestRepoHashes as jest.MockedFunction<typeof fetchLatestRepoHashes>).mockResolvedValue(
      new Map([['patternfly/patternfly-react', '2222222222222222222222222222222222222222']])
    );
    mockWriteJsonCollection.mockResolvedValue({
      jsonContent: '{}',
      sizeKb: '1.0',
      durationSec: '0.1'
    });
    (saveCsvReport as jest.MockedFunction<typeof saveCsvReport>).mockResolvedValue(undefined);
  });

  it('should execute the docs update workflow and return a structured diff', async () => {
    const diff = await run({
      docsPath: '/mock/docs.json',
      apiPath: '/mock/api.json',
      pruneApiOverlap: false,
      updateHashes: false,
      outputCsv: false
    });

    expect(mockReadFile).toHaveBeenCalledWith('/mock/docs.json', 'utf-8');
    expect(mockWriteJsonCollection).toHaveBeenCalled();
    expect(diff).toMatchObject({
      added: expect.any(Array),
      removed: expect.any(Array),
      modified: expect.any(Array),
      unchanged: expect.any(Array)
    });
  });

  it('should safely handle and ignore malformed API JSON without failing the run', async () => {
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(mockCatalog))
      .mockResolvedValueOnce('invalid json');

    const diff = await run({ pruneApiOverlap: true, updateHashes: false, outputCsv: false });

    expect(diff).toBeDefined();
  });
});

describe('API Deduplication Regression Guard (E2E)', () => {
  it('should correctly detect all redundant AI-helper entries when cross-referenced with API seed', () => {
    const sourcePath = existsSync(RECORDS_MAINT_DOCS_PATH) ? RECORDS_MAINT_DOCS_PATH : DOCS_PATH;
    const rawDocs = readFileSync(sourcePath, 'utf-8');
    const rawApi = readFileSync(API_PATH, 'utf-8');
    const docs = JSON.parse(rawDocs);
    const api = JSON.parse(rawApi);

    const redundant = findApiRedundantDocs(docs, api.records);

    if (docs.meta.totalDocs >= 341) {
      expect(redundant.length).toBe(3);

      const expectedDisplayNames = [
        'AI Helpers, an agent marketplace for skills',
        'AI Helpers contributing skills',
        'AI Helpers contributing'
      ];
      const expectedPathSlugs = [
        'ai-helpers-readme',
        'ai-helpers-contributing',
        'ai-helpers-contributing-skills'
      ];

      const redundantDisplayNames = new Set(redundant.map(report => report.record.displayName));
      const redundantPathSlugs = new Set(redundant.map(report => report.record.pathSlug));

      for (const name of expectedDisplayNames) {
        expect(redundantDisplayNames.has(name)).toBe(true);
      }
      for (const slug of expectedPathSlugs) {
        expect(redundantPathSlugs.has(slug)).toBe(true);
      }
    } else {
      expect(redundant.length).toBe(0);
    }
  });

  it('should preserve the current root AIHelpers guides and ecosystem repositories without false positives', () => {
    const rawDocs = readFileSync(DOCS_PATH, 'utf-8');
    const rawApi = readFileSync(API_PATH, 'utf-8');
    const docs = JSON.parse(rawDocs);
    const api = JSON.parse(rawApi);

    const redundant = findApiRedundantDocs(docs, api.records);
    const redundantPaths = new Set(redundant.map(report => report.record.path));

    const rootAiHelpers = docs.docs['AIHelpers'] || [];

    for (const item of rootAiHelpers) {
      if (item.pathSlug.startsWith('uxd-ai-helpers-')) {
        expect(redundantPaths.has(item.path)).toBe(false);
      }
    }

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

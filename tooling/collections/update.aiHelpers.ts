import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { type PatternFlyMcpDocsCatalogEntry } from '../../src/docs.embedded';
import {
  generateDiffCsv,
  getDefaultReportPath,
  saveCsvReport
} from './csv';
import {
  AI_HELPERS_DEFAULT_OWNER,
  AI_HELPERS_DEFAULT_REPO,
  buildPinnedRawGitHubUrl,
  crawlAiHelpersCatalog,
  diffAiHelpersCatalogs,
  isStableSha,
  type AiHelpersBlobReadResult,
  type AiHelpersCatalogDiff,
  type AiHelpersCatalogRecord,
  type AiHelpersCrawlResult,
  type AiHelpersGitTreeEntry,
  type AiHelpersRepositoryReader
} from './aiHelpers';
import { getSrcPath, runUpdateTask, writeJsonCollection } from './helpers';
import { printDiffSummary } from './summary';

const DEFAULT_AI_HELPERS_FILENAME = 'collection.aiHelpers.json';
const DEFAULT_AI_HELPERS_REPORT_FILENAME = 'collection.aiHelpers.report.csv';
const AI_HELPERS_COLLECTION_VERSION = 'main';
const AI_HELPERS_SEED_LICENSE = 'MIT';
// cspell:ignore Puzzo jpuzz — historical ai-helpers attribution required in seed meta
const AI_HELPERS_ATTRIBUTION = 'Jeff Puzzo (@jpuzz0)';
const AI_HELPERS_META_SOURCE = 'patternfly-mcp-ai-helpers';

/**
 * Extended metadata stored in the ai-helpers seed envelope.
 */
interface AiHelpersSeedMeta {
  totalEntries: number;
  totalDocs: number;
  source: string;
  sourceRepository: string;
  requestedRef: string;
  resolvedCommitSha: string;
  license: string;
  attribution: string;
}

/**
 * Docs-catalog envelope written by the ai-helpers reseed command.
 */
interface AiHelpersSeedCollection {
  version: string;
  generated: string;
  meta: AiHelpersSeedMeta;
  docs: PatternFlyMcpDocsCatalogEntry;
}

/**
 * Options for running the ai-helpers reseed update.
 */
interface UpdateAiHelpersOptions {
  filename?: string | undefined;
  reportFilename?: string | undefined;
  outputPath?: string | undefined;
  csvOutputPath?: string | undefined;
  ref?: string | undefined;
  owner?: string | undefined;
  repo?: string | undefined;
  reader?: AiHelpersRepositoryReader | undefined;
  isPrettyPrint?: boolean | undefined;
  outputCsv?: boolean | undefined;
}

/**
 * HTTP fetch dependency used by the default GitHub reader adapter.
 */
type FetchLike = typeof fetch;

/**
 * GitHub tree API payload (subset).
 */
interface GitHubTreeResponse {
  sha: string;
  truncated?: boolean;
  tree?: Array<{
    path?: string;
    mode?: string;
    type?: 'blob' | 'tree';
    sha?: string;
    size?: number;
  }>;
}

/**
 * GitHub commit resolution payload (subset).
 */
interface GitHubCommitResponse {
  sha?: string;
}

/**
 * Modified record report row for CSV and console output.
 */
interface AiHelpersModifiedReport {
  record: AiHelpersCatalogRecord;
  prior: AiHelpersCatalogRecord;
  reasons: string[];
}

type AiHelpersReseedDiff = AiHelpersCatalogDiff & {
  modifiedReports: AiHelpersModifiedReport[];
};

/**
 * @param collection - Seed collection
 * @returns Flat, sorted catalog records from all doc sections
 */
const flattenAiHelpersSeedRecords = (collection: AiHelpersSeedCollection): AiHelpersCatalogRecord[] => {
  const records = Object.values(collection.docs || {}).flatMap(section =>
    (Array.isArray(section) ? section : []) as AiHelpersCatalogRecord[]);

  return [...records].sort(
    (a, b) => a.pathSlug.localeCompare(b.pathSlug) || a.sourcePath.localeCompare(b.sourcePath)
  );
};

/**
 * @param value - Parsed JSON value
 * @returns Validated ai-helpers seed collection
 */
const validateExistingAiHelpersSeed = (value: unknown): AiHelpersSeedCollection => {
  if (!value || typeof value !== 'object') {
    throw new Error('Existing ai-helpers seed is not a JSON object.');
  }

  const candidate = value as Partial<AiHelpersSeedCollection>;

  if (typeof candidate.version !== 'string' || !candidate.version.trim()) {
    throw new Error('Existing ai-helpers seed is missing a version string.');
  }

  if (typeof candidate.generated !== 'string' || !candidate.generated.trim()) {
    throw new Error('Existing ai-helpers seed is missing a generated timestamp.');
  }

  if (!candidate.meta || typeof candidate.meta !== 'object') {
    throw new Error('Existing ai-helpers seed is missing meta.');
  }

  const meta = candidate.meta as Partial<AiHelpersSeedMeta>;
  const requiredMetaFields: Array<keyof AiHelpersSeedMeta> = [
    'totalEntries',
    'totalDocs',
    'source',
    'sourceRepository',
    'requestedRef',
    'resolvedCommitSha',
    'license',
    'attribution'
  ];

  for (const field of requiredMetaFields) {
    const valueAtField = meta[field];

    if (valueAtField === undefined || valueAtField === null || valueAtField === '') {
      throw new Error(`Existing ai-helpers seed meta is missing "${String(field)}".`);
    }
  }

  if (!isStableSha(String(meta.resolvedCommitSha))) {
    throw new Error('Existing ai-helpers seed meta resolvedCommitSha must be a 40-character SHA.');
  }

  if (!candidate.docs || typeof candidate.docs !== 'object' || Array.isArray(candidate.docs)) {
    throw new Error('Existing ai-helpers seed is missing a docs object.');
  }

  const records = flattenAiHelpersSeedRecords(candidate as AiHelpersSeedCollection);

  if (records.length === 0) {
    throw new Error('Existing ai-helpers seed contains no catalog records.');
  }

  for (const record of records) {
    if (!record.pathSlug || !record.sourcePath || !record.path) {
      throw new Error('Existing ai-helpers seed contains an invalid catalog record.');
    }
  }

  return candidate as AiHelpersSeedCollection;
};

/**
 * @param records - Crawled catalog records
 * @returns Docs object grouped by section
 */
const groupAiHelpersRecordsBySection = (records: AiHelpersCatalogRecord[]): PatternFlyMcpDocsCatalogEntry => {
  const grouped = new Map<string, AiHelpersCatalogRecord[]>();

  for (const record of records) {
    const bucket = grouped.get(record.section) || [];

    bucket.push(record);
    grouped.set(record.section, bucket);
  }

  const docs: PatternFlyMcpDocsCatalogEntry = {};

  for (const section of [...grouped.keys()].sort((a, b) => a.localeCompare(b))) {
    const sectionRecords = grouped.get(section) || [];

    docs[section] = [...sectionRecords].sort(
      (a, b) => a.pathSlug.localeCompare(b.pathSlug) || a.sourcePath.localeCompare(b.sourcePath)
    );
  }

  return docs;
};

/**
 * @param crawl - Crawl result
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param [generated=new Date().toISOString()] - Generation timestamp
 * @returns Seed envelope for JSON output
 */
const buildAiHelpersSeedCollection = (
  crawl: AiHelpersCrawlResult,
  owner: string,
  repo: string,
  generated = new Date().toISOString()
): AiHelpersSeedCollection => {
  const docs = groupAiHelpersRecordsBySection(crawl.records);
  const totalEntries = Object.keys(docs).length;
  const totalDocs = crawl.records.length;

  return {
    version: AI_HELPERS_COLLECTION_VERSION,
    generated,
    meta: {
      totalEntries,
      totalDocs,
      source: AI_HELPERS_META_SOURCE,
      sourceRepository: `${owner}/${repo}`,
      requestedRef: crawl.requestedRef,
      resolvedCommitSha: crawl.commitSha,
      license: AI_HELPERS_SEED_LICENSE,
      attribution: AI_HELPERS_ATTRIBUTION
    },
    docs
  };
};

/**
 * @param prior - Previous record
 * @param next - Next record
 * @returns Human-readable modification reasons
 */
const describeAiHelpersModification = (
  prior: AiHelpersCatalogRecord,
  next: AiHelpersCatalogRecord
): string[] => {
  const reasons: string[] = [];

  if (prior.sourcePath !== next.sourcePath) {
    reasons.push(`source path relocation/rename (${prior.sourcePath} -> ${next.sourcePath})`);
  }

  if (prior.displayName !== next.displayName) {
    reasons.push(`displayName ("${prior.displayName}" -> "${next.displayName}")`);
  }

  if (prior.description !== next.description) {
    reasons.push('description updated');
  }

  if (prior.path !== next.path) {
    reasons.push('pinned raw URL updated');
  }

  if (prior.sourceBlobSha !== next.sourceBlobSha) {
    reasons.push('source blob SHA updated');
  }

  if (prior.sourceContentHash !== next.sourceContentHash) {
    reasons.push('source content hash updated');
  }

  if (prior.plugin !== next.plugin) {
    reasons.push(`plugin ("${prior.plugin}" -> "${next.plugin}")`);
  }

  if (prior.family !== next.family) {
    reasons.push(`family ("${prior.family}" -> "${next.family}")`);
  }

  if (prior.kind !== next.kind) {
    reasons.push(`kind ("${prior.kind}" -> "${next.kind}")`);
  }

  return reasons;
};

/**
 * @param previous - Prior flat catalog
 * @param next - Next flat catalog
 * @returns Semantic diff with modification reports
 */
const diffAiHelpersSeedCatalogs = (
  previous: AiHelpersCatalogRecord[],
  next: AiHelpersCatalogRecord[]
): AiHelpersReseedDiff => {
  const base = diffAiHelpersCatalogs(previous, next);
  const previousBySlug = new Map(previous.map(record => [record.pathSlug, record]));
  const modifiedReports: AiHelpersModifiedReport[] = base.modified.map(record => {
    const prior = previousBySlug.get(record.pathSlug);

    if (!prior) {
      return { record, prior: record, reasons: ['modified without prior record'] };
    }

    return {
      record,
      prior,
      reasons: describeAiHelpersModification(prior, record)
    };
  });

  return { ...base, modifiedReports };
};

/**
 * @param existing - Existing seed when present
 * @param crawl - Successful crawl result
 * @param diff - Calculated diff against existing catalog
 * @returns True when seed bytes and report should be preserved
 */
const isAiHelpersReseedNoOp = (
  existing: AiHelpersSeedCollection | undefined,
  crawl: AiHelpersCrawlResult,
  diff: AiHelpersCatalogDiff
): boolean =>
  Boolean(existing) &&
  existing?.meta.resolvedCommitSha === crawl.commitSha &&
  diff.added.length === 0 &&
  diff.removed.length === 0 &&
  diff.modified.length === 0;

/**
 * @param diff - Complete diff with modification metadata
 * @param previous - Prior flat catalog
 * @returns RFC 4180 CSV report content
 */
const generateReportCsv = (
  diff: AiHelpersReseedDiff,
  previous: AiHelpersCatalogRecord[]
): string => {
  const previousBySlug = new Map(previous.map(record => [record.pathSlug, record]));
  const changedSlugs = new Set([
    ...diff.added.map(record => record.pathSlug),
    ...diff.removed.map(record => record.pathSlug),
    ...diff.modified.map(record => record.pathSlug)
  ]);
  const unchanged = diff.unchanged.filter(record => !changedSlugs.has(record.pathSlug));

  return generateDiffCsv(
    {
      added: diff.added,
      removed: diff.removed,
      modified: diff.modifiedReports,
      unchanged
    },
    {
      headers: [
        'pathSlug',
        'displayName',
        'kind',
        'family',
        'sourcePath',
        'previousSourcePath',
        'reason',
        'details'
      ],
      added: record => [
        record.pathSlug,
        record.displayName,
        record.kind,
        record.family,
        record.sourcePath,
        '',
        'added',
        ''
      ],
      removed: record => [
        record.pathSlug,
        record.displayName,
        record.kind,
        record.family,
        record.sourcePath,
        record.sourcePath,
        'removed',
        ''
      ],
      modified: ({ record, prior, reasons }) => [
        record.pathSlug,
        record.displayName,
        record.kind,
        record.family,
        record.sourcePath,
        prior.sourcePath,
        reasons.some(reason => reason.includes('relocation/rename')) ? 'relocation/rename' : 'modified',
        reasons.join('; ')
      ],
      unchanged: record => [
        record.pathSlug,
        record.displayName,
        record.kind,
        record.family,
        record.sourcePath,
        previousBySlug.get(record.pathSlug)?.sourcePath || record.sourcePath,
        '',
        ''
      ]
    }
  );
};

/**
 * @param diff - Complete diff result
 */
const logAiHelpersDiffReport = (diff: AiHelpersReseedDiff): void => {
  printDiffSummary(
    {
      added: diff.added,
      removed: diff.removed,
      modified: diff.modifiedReports
    },
    {
      title: 'AI Helpers Collection Diff Report',
      formatAdded: record => `${record.pathSlug} (${record.sourcePath})`,
      formatRemoved: record => `${record.pathSlug} (${record.sourcePath})`,
      formatModified: ({ record, reasons }) => `${record.pathSlug} [${reasons.join(', ')}]`
    }
  );
};

/**
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param [fetchImpl=fetch] - Injected fetch implementation
 * @returns Repository reader backed by the GitHub REST and raw content APIs
 */
const createGitHubAiHelpersReader = (
  owner: string,
  repo: string,
  fetchImpl: FetchLike = fetch
): AiHelpersRepositoryReader => {
  const treeByPath = new Map<string, AiHelpersGitTreeEntry>();

  return {
    async resolveRef(ref: string): Promise<string> {
      const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'patternfly-mcp-ai-helpers-reseed'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to resolve ref "${ref}" for ${owner}/${repo}: HTTP ${response.status}`);
      }

      const payload = await response.json() as GitHubCommitResponse;
      const sha = typeof payload.sha === 'string' ? payload.sha : '';

      if (!isStableSha(sha)) {
        throw new Error(`Ref "${ref}" did not resolve to a 40-character SHA.`);
      }

      return sha;
    },

    async listTree(commitSha: string, options?: { recursive?: boolean }): Promise<AiHelpersGitTreeEntry[]> {
      if (!isStableSha(commitSha)) {
        throw new Error('listTree requires a 40-character commit SHA.');
      }

      const recursive = options?.recursive ? '1' : '0';
      const response = await fetchImpl(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=${recursive}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'patternfly-mcp-ai-helpers-reseed'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to list Git tree for ${commitSha}: HTTP ${response.status}`);
      }

      const payload = await response.json() as GitHubTreeResponse;

      if (payload.truncated) {
        throw new Error('GitHub returned a truncated recursive tree; refusing incomplete ai-helpers crawl.');
      }

      const entries: AiHelpersGitTreeEntry[] = [];

      for (const item of payload.tree || []) {
        if (!item.path || !item.sha || !item.type || !item.mode) {
          continue;
        }

        const entry: AiHelpersGitTreeEntry = {
          path: item.path,
          type: item.type,
          mode: item.mode,
          sha: item.sha,
          ...(typeof item.size === 'number' ? { size: item.size } : {})
        };

        entries.push(entry);
        treeByPath.set(item.path, entry);
      }

      return entries;
    },

    async readBlob(commitSha: string, path: string): Promise<AiHelpersBlobReadResult> {
      const treeEntry = treeByPath.get(path);
      const pinnedUrl = buildPinnedRawGitHubUrl(owner, repo, commitSha, path);
      const response = await fetchImpl(pinnedUrl, {
        headers: {
          Accept: 'application/vnd.github.raw',
          'User-Agent': 'patternfly-mcp-ai-helpers-reseed'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch blob content for "${path}": HTTP ${response.status}`);
      }

      const content = await response.text();

      return {
        path,
        sha: treeEntry?.sha || commitSha,
        size: Buffer.byteLength(content, 'utf-8'),
        content
      };
    }
  };
};

/**
 * Reseed the ai-helpers catalog seed from the upstream Git repository.
 *
 * @param [options] - Optional execution options
 * @param [options.filename=DEFAULT_AI_HELPERS_FILENAME] - Target seed filename.
 * @param [options.reportFilename=DEFAULT_AI_HELPERS_REPORT_FILENAME] - Target CSV report filename.
 * @param [options.outputPath] - Fully resolved path to write the seed collection.
 * @param [options.csvOutputPath] - Fully resolved path to write the CSV report.
 * @param [options.ref='main'] - Requested Git ref to resolve once.
 * @param [options.owner=AI_HELPERS_DEFAULT_OWNER] - Repository owner.
 * @param [options.repo=AI_HELPERS_DEFAULT_REPO] - Repository name.
 * @param [options.reader] - Optional injected repository reader.
 * @param [options.isPrettyPrint=true] - Whether to pretty-print JSON output.
 * @param [options.outputCsv=true] - Whether to emit a CSV report when changes are written.
 * @returns Promise resolving to the calculated diff
 */
const run = async ({
  filename = DEFAULT_AI_HELPERS_FILENAME,
  reportFilename = DEFAULT_AI_HELPERS_REPORT_FILENAME,
  outputPath = getSrcPath(filename),
  csvOutputPath = getDefaultReportPath(reportFilename),
  ref = 'main',
  owner = AI_HELPERS_DEFAULT_OWNER,
  repo = AI_HELPERS_DEFAULT_REPO,
  reader,
  isPrettyPrint = true,
  outputCsv = true
}: UpdateAiHelpersOptions = {}): Promise<AiHelpersReseedDiff> => {
  console.log('🚀 Reseeding ai-helpers catalog collection...');
  const startTime = Date.now();

  let existingSeed: AiHelpersSeedCollection | undefined;
  let existingRaw: string | undefined;

  if (existsSync(outputPath)) {
    existingRaw = await readFile(outputPath, 'utf-8');

    try {
      existingSeed = validateExistingAiHelpersSeed(JSON.parse(existingRaw) as unknown);
    } catch (error) {
      throw new Error(
        `Refusing to replace seed at ${outputPath}: ${error instanceof Error ? error.message : 'invalid existing seed'}`
      );
    }
  }

  const repositoryReader = reader || createGitHubAiHelpersReader(owner, repo);
  const crawl = await crawlAiHelpersCatalog(repositoryReader, { ref, owner, repo });
  const previousRecords = existingSeed ? flattenAiHelpersSeedRecords(existingSeed) : [];
  const diff = diffAiHelpersSeedCatalogs(previousRecords, crawl.records);

  if (isAiHelpersReseedNoOp(existingSeed, crawl, diff)) {
    console.log('✨ Resolved SHA and catalog unchanged; preserving existing ai-helpers seed.');

    return diff;
  }

  const nextSeed = buildAiHelpersSeedCollection(crawl, owner, repo);

  await writeJsonCollection(outputPath, nextSeed, {
    isPrettyPrint,
    startTime,
    stats: [
      { label: 'Catalog Sections', value: nextSeed.meta.totalEntries },
      { label: 'Catalog Records', value: nextSeed.meta.totalDocs },
      { label: 'Resolved SHA', value: crawl.commitSha }
    ]
  });

  logAiHelpersDiffReport(diff);

  const hasCatalogChanges =
    diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;

  if (outputCsv && hasCatalogChanges) {
    const csvContent = generateReportCsv(diff, previousRecords);

    await saveCsvReport(csvOutputPath, csvContent);
  }

  return diff;
};

runUpdateTask('AI Helpers collection', run);

export {
  AI_HELPERS_ATTRIBUTION,
  AI_HELPERS_COLLECTION_VERSION,
  AI_HELPERS_META_SOURCE,
  AI_HELPERS_SEED_LICENSE,
  DEFAULT_AI_HELPERS_FILENAME,
  DEFAULT_AI_HELPERS_REPORT_FILENAME,
  buildAiHelpersSeedCollection,
  createGitHubAiHelpersReader,
  describeAiHelpersModification,
  diffAiHelpersSeedCatalogs,
  flattenAiHelpersSeedRecords,
  generateReportCsv,
  groupAiHelpersRecordsBySection,
  isAiHelpersReseedNoOp,
  logAiHelpersDiffReport,
  run,
  validateExistingAiHelpersSeed,
  type AiHelpersModifiedReport,
  type AiHelpersReseedDiff,
  type AiHelpersSeedCollection,
  type AiHelpersSeedMeta,
  type UpdateAiHelpersOptions
};

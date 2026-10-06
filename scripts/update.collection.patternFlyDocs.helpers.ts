import {
  type PatternFlyMcpDocsCatalog,
  type PatternFlyMcpDocsCatalogDoc,
  type PatternFlyMcpDocsCatalogEntry
} from '../src/docs.embedded';

/**
 * Information extracted from a raw GitHub documentation URL.
 */
interface GitHubUrlInfo {
  owner: string;
  repo: string;
  ref: string;
  filePath: string;
}

/**
 * Report entry for an added document in the manifest.
 */
interface DocsAddedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
  reason?: string | undefined;
  details?: string | undefined;
}

/**
 * Report entry for a removed document in the manifest.
 */
interface DocsRemovedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
  reason: string;
  details?: string | undefined;
}

/**
 * Report entry for a modified document in the manifest.
 */
interface DocsModifiedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
  previousRecord?: PatternFlyMcpDocsCatalogDoc | undefined;
  reasons: string[];
  previousHash?: string | undefined;
  newHash?: string | undefined;
}

/**
 * Report entry for an unchanged document in the manifest.
 */
interface DocsUnchangedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
}

/**
 * Complete diff result between two documentation manifests.
 */
interface DocsDiffResult {
  added: DocsAddedRecordReport[];
  removed: DocsRemovedRecordReport[];
  modified: DocsModifiedRecordReport[];
  unchanged: DocsUnchangedRecordReport[];
}

/**
 * Minimal shape of an API embedded collection record for cross-referencing.
 */
interface ApiCollectionRecordRef {
  p: string;
  n?: string | undefined;
  q?: number | undefined;
}

/**
 * Options for recalculating manifest metadata and transforming entries.
 */
interface RecalculateOptions {
  redundantRecords?: DocsRemovedRecordReport[] | undefined;
  latestHashes?: Map<string, string> | undefined;
  verifyReachability?: boolean | undefined;
}

/**
 * Default list of repositories tracked for PatternFly documentation updates.
 */
const DEFAULT_TRACKED_REPOS = [
  { owner: 'patternfly', repo: 'patternfly-org', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-react', branch: 'main' },
  { owner: 'rh-uxd', repo: 'ai-helpers', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-cli', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-elements', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-mcp', branch: 'main' },
  { owner: 'patternfly', repo: 'pf-codemods', branch: 'main' }
];

/**
 * Safely escape and format a field for standard RFC 4180 CSV output.
 *
 * @note **CSV / Formula Injection:** By default (`sanitizeFormulas = true`), leading formula
 * trigger characters are prefixed with a single quote to prevent spreadsheet execution. Pass
 * `false` to preserve strict raw string fidelity for automated downstream parsers.
 *
 * @param field - Value to format for CSV
 * @param [sanitizeFormulas=true] - Whether to prefix formula trigger characters with a single quote
 * @returns RFC 4180 compliant CSV cell string
 */
const escapeCsvField = (field: unknown, sanitizeFormulas = true): string => {
  if (field === null || field === undefined) {
    return '';
  }

  let str = String(field);

  if (sanitizeFormulas && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

/**
 * Format rows and headers into standard CSV string.
 *
 * @param headers - Column headers
 * @param rows - Table rows
 * @returns Formatted CSV string
 */
const formatCsv = (headers: string[], rows: (string | number | undefined | null)[][]): string => {
  const headerLine = headers.map(field => escapeCsvField(field)).join(',');
  const rowLines = rows.map(row => row.map(cell => escapeCsvField(cell)).join(','));

  return [headerLine, ...rowLines].join('\n') + '\n';
};

/**
 * Extract commit hash or ref from a raw GitHub documentation URL.
 *
 * @param url - Raw GitHub URL
 * @returns Hash/ref string or null if not a recognized GitHub raw URL
 */
const extractCommitHash = (url: string): string | null => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\//);

  return match && match[1] ? match[1] : null;
};

/**
 * Extract structured repository and path information from a raw GitHub URL.
 *
 * @param url - Raw GitHub URL
 * @returns GitHubUrlInfo or null if not a recognized raw URL
 */
const extractRepoInfo = (url: string): GitHubUrlInfo | null => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);

  if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    ref: match[3],
    filePath: match[4]
  };
};

/**
 * Probe URL reachability using HTTP HEAD / GET request.
 *
 * @param url - Target URL to probe
 * @param [timeoutMs=5000] - Timeout in milliseconds
 * @returns Promise resolving to true if status is 2xx, false otherwise
 */
const verifyUrlReachability = async (url: string, timeoutMs = 5000): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'patternfly-mcp-audit' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return true;
    }

    // Fallback to GET for hosts that reject HEAD requests
    if (response.status === 405 || response.status === 403) {
      const getController = new AbortController();
      const getTimeoutId = setTimeout(() => getController.abort(), timeoutMs);

      const getResponse = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'patternfly-mcp-audit' },
        signal: getController.signal
      });

      clearTimeout(getTimeoutId);

      return getResponse.ok;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Identify documentation entries in `docs.json` that are redundant with and superseded by the PatternFly API collection.
 *
 * @param docsCatalog - The documentation catalog to inspect
 * @param [apiRecords=[]] - Records from the API collection seed
 * @returns List of redundant records with removal reasons and matched API details
 */
const findApiRedundantDocs = (
  docsCatalog: PatternFlyMcpDocsCatalog,
  apiRecords: ApiCollectionRecordRef[] = []
): DocsRemovedRecordReport[] => {
  const redundant: DocsRemovedRecordReport[] = [];
  const highQualityApi = (apiRecords || []).filter(apiRecord => (apiRecord.q ?? 1) >= 0.95);

  for (const [category, entries] of Object.entries(docsCatalog.docs || {})) {
    for (const doc of entries) {
      // 1. Root uxd-ai-helpers guides must NEVER be pruned (negative control boundary)
      if (doc.pathSlug && doc.pathSlug.startsWith('uxd-ai-helpers-')) {
        continue;
      }

      // 2. Ecosystem / tooling repos must NEVER be pruned
      if (
        doc.path &&
        (doc.path.includes('/patternfly-cli/') ||
          doc.path.includes('/patternfly-elements/') ||
          doc.path.includes('/patternfly-mcp/') ||
          doc.path.includes('/pf-codemods/'))
      ) {
        continue;
      }

      const isAiHelperRepo =
        doc.path &&
        (doc.path.includes('/ai-helpers/') || doc.path.includes('/uxd-ai-helpers/'));

      if (isAiHelperRepo) {
        // A. Standalone root ai-helpers links superseded by the marketplace endpoint
        if (
          doc.pathSlug === 'ai-helpers-readme' ||
          doc.pathSlug === 'ai-helpers-contributing' ||
          doc.pathSlug === 'ai-helpers-contributing-skills'
        ) {
          redundant.push({
            category,
            record: doc,
            reason: 'superseded by API collection',
            details: 'v6/AI/ai-assisted-development_marketplace/text'
          });
          continue;
        }

        // B. Component / development guideline markdown files in ai-helpers
        if (doc.path.includes('/docs/')) {
          let details = 'v6/AI/development-guidelines';

          if (doc.pathSlug === 'development-rules' || doc.path.endsWith('/docs/README.md')) {
            details = 'v6/AI/development-guidelines_overview/text';
          } else if (doc.pathSlug === 'guidelines' || doc.path.includes('/docs/guidelines/README.md')) {
            details = 'v6/AI/development-guidelines_overview/text';
          } else if (doc.pathSlug === 'table-rules' || doc.path.includes('table.md')) {
            details = 'v6/AI/development-guidelines_table/text';
          } else if (doc.pathSlug === 'charts' || doc.path.includes('/docs/charts/')) {
            details = 'v6/AI/development-guidelines_charts/text';
          } else if (doc.pathSlug === 'chatbot' || doc.path.includes('/docs/chatbot/')) {
            details = 'v6/AI/development-guidelines_chatbot/text';
          } else if (doc.pathSlug === 'ai-prompt-guidance' || doc.path.includes('ai-prompt-guidance.md')) {
            details = 'v6/AI/development-guidelines_ai-prompt-guidance/text';
          } else if (doc.pathSlug === 'styling-standards' || doc.path.includes('styling-standards.md')) {
            details = 'v6/AI/development-guidelines_styling-standards/text';
          } else if (doc.pathSlug === 'setup' || doc.path.includes('/docs/setup/README.md')) {
            details = 'v6/AI/development-guidelines_setup/text';
          } else if (doc.pathSlug === 'development-environment' || doc.path.includes('development-environment.md')) {
            details = 'v6/AI/development-guidelines_development-environment/text';
          } else if (doc.pathSlug === 'quick-start' || doc.path.includes('quick-start.md')) {
            details = 'v6/AI/development-guidelines_quick-start/text';
          } else if (doc.pathSlug === 'troubleshooting' || doc.path.includes('common-issues.md')) {
            details = 'v6/AI/development-guidelines_common-issues/text';
          } else if (doc.pathSlug === 'component-architecture' || doc.path.includes('component-architecture.md')) {
            details = 'v6/AI/development-guidelines_component-architecture/text';
          } else if (doc.pathSlug === 'deployment-guide' || doc.path.includes('deployment-guide.md')) {
            details = 'v6/AI/development-guidelines_deployment-guide/text';
          } else if (doc.pathSlug === 'component-groups' || doc.path.includes('component-groups')) {
            details = 'v6/AI/development-guidelines_component-groups/text';
          } else if (doc.pathSlug === 'data-display' || doc.path.includes('data-display/README.md')) {
            details = 'v6/AI/development-guidelines_data-display/text';
          } else if (doc.pathSlug === 'layout-components' || doc.path.includes('layout/README.md')) {
            details = 'v6/AI/development-guidelines_layout/text';
          } else if (doc.pathSlug === 'external-links' || doc.path.includes('external-links.md')) {
            details = 'v6/AI/development-guidelines_external-links/text';
          } else {
            const matchedApi = highQualityApi.find(candidateApi => candidateApi.p.toLowerCase().includes(doc.pathSlug.toLowerCase().replace(/[^a-z0-9]/g, '')));

            if (matchedApi) {
              details = matchedApi.p;
            }
          }

          redundant.push({
            category,
            record: doc,
            reason: 'superseded by API collection',
            details
          });
        }
      }
    }
  }

  return redundant;
};

/**
 * Fetch latest commit hashes for tracked repositories from GitHub API.
 *
 * @param [repos=DEFAULT_TRACKED_REPOS] - Repositories to query
 * @returns Map of "owner/repo" to commit SHA
 */
const fetchLatestRepoHashes = async (
  repos = DEFAULT_TRACKED_REPOS
): Promise<Map<string, string>> => {
  const hashes = new Map<string, string>();

  for (const { owner, repo, branch = 'main' } of repos) {
    const key = `${owner}/${repo}`;

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'patternfly-mcp',
          Accept: 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const data = (await response.json()) as { sha?: string };

        if (data.sha) {
          hashes.set(key, data.sha);
          // Also alias by repo name alone if unique
          hashes.set(repo, data.sha);
        }
      }
    } catch {
      // Fallback: network unavailable or rate limited
    }
  }

  return hashes;
};

/**
 * Calculate the diff between an old documentation catalog and an updated catalog.
 *
 * @param oldCatalog - Original catalog
 * @param newCatalog - Updated catalog
 * @param [redundantReports=[]] - Explicitly identified removals
 * @returns Structured DocsDiffResult
 */
const diffDocsManifests = (
  oldCatalog: PatternFlyMcpDocsCatalog,
  newCatalog: PatternFlyMcpDocsCatalog,
  redundantReports: DocsRemovedRecordReport[] = []
): DocsDiffResult => {
  const added: DocsAddedRecordReport[] = [];
  const removed: DocsRemovedRecordReport[] = [...redundantReports];
  const modified: DocsModifiedRecordReport[] = [];
  const unchanged: DocsUnchangedRecordReport[] = [];

  const oldRecordsMap = new Map<string, { category: string; doc: PatternFlyMcpDocsCatalogDoc }>();

  for (const [cat, docs] of Object.entries(oldCatalog.docs || {})) {
    for (const doc of docs) {
      oldRecordsMap.set(`${cat}::${doc.pathSlug}::${doc.displayName}`, { category: cat, doc });
    }
  }

  const newRecordsMap = new Map<string, { category: string; doc: PatternFlyMcpDocsCatalogDoc }>();

  for (const [cat, docs] of Object.entries(newCatalog.docs || {})) {
    for (const doc of docs) {
      newRecordsMap.set(`${cat}::${doc.pathSlug}::${doc.displayName}`, { category: cat, doc });
    }
  }

  const removedKeys = new Set(
    redundantReports.map(report => `${report.category}::${report.record.pathSlug}::${report.record.displayName}`)
  );

  // Check for any additional old records missing in new catalog
  for (const [key, { category, doc }] of oldRecordsMap.entries()) {
    if (!newRecordsMap.has(key) && !removedKeys.has(key)) {
      removed.push({
        category,
        record: doc,
        reason: 'removed from manifest',
        details: 'Record excluded during manifest update'
      });
      removedKeys.add(key);
    }
  }

  // Check for added, modified, or unchanged in new catalog
  for (const [key, { category, doc }] of newRecordsMap.entries()) {
    const oldEntry = oldRecordsMap.get(key);

    if (!oldEntry) {
      added.push({
        category,
        record: doc,
        reason: 'new upstream document',
        details: 'Discovered in manifest update'
      });
      continue;
    }

    const prevDoc = oldEntry.doc;
    const reasons: string[] = [];
    const prevHash = extractCommitHash(prevDoc.path);
    const newHash = extractCommitHash(doc.path);

    if (prevDoc.path !== doc.path) {
      if (prevHash && newHash && prevHash !== newHash) {
        reasons.push(`hash update (${prevHash.slice(0, 7)} -> ${newHash.slice(0, 7)})`);
      } else {
        reasons.push('path updated');
      }
    }

    if (prevDoc.description !== doc.description) {
      reasons.push('description updated');
    }

    if (prevDoc.version !== doc.version) {
      reasons.push(`version (${prevDoc.version} -> ${doc.version})`);
    }

    if (reasons.length > 0) {
      modified.push({
        category,
        record: doc,
        previousRecord: prevDoc,
        reasons,
        previousHash: prevHash || undefined,
        newHash: newHash || undefined
      });
    } else {
      unchanged.push({
        category,
        record: doc
      });
    }
  }

  return { added, removed, modified, unchanged };
};

/**
 * Generate a complete, non-truncated CSV report for documentation manifest changes.
 *
 * @param diff - Diff calculation between old and new manifests
 * @returns RFC 4180 CSV string
 */
const generateDocsReportCsv = (diff: DocsDiffResult): string => {
  const headers = [
    'status',
    'category',
    'name',
    'pathSlug',
    'path',
    'previousHash',
    'newHash',
    'reason',
    'details'
  ];
  const rows: (string | number | undefined | null)[][] = [];

  for (const item of diff.added) {
    const hash = extractCommitHash(item.record.path) || '';

    rows.push([
      'ADDED',
      item.category,
      item.record.displayName,
      item.record.pathSlug,
      item.record.path,
      '',
      hash,
      item.reason || '',
      item.details || ''
    ]);
  }

  for (const item of diff.removed) {
    const hash = extractCommitHash(item.record.path) || '';

    rows.push([
      'REMOVED',
      item.category,
      item.record.displayName,
      item.record.pathSlug,
      item.record.path,
      hash,
      '',
      item.reason,
      item.details || ''
    ]);
  }

  for (const item of diff.modified) {
    rows.push([
      'MODIFIED',
      item.category,
      item.record.displayName,
      item.record.pathSlug,
      item.record.path,
      item.previousHash || '',
      item.newHash || '',
      'property changes',
      item.reasons.join('; ')
    ]);
  }

  for (const item of diff.unchanged) {
    const hash = extractCommitHash(item.record.path) || '';

    rows.push([
      'UNCHANGED',
      item.category,
      item.record.displayName,
      item.record.pathSlug,
      item.record.path,
      hash,
      hash,
      '',
      ''
    ]);
  }

  return formatCsv(headers, rows);
};

/**
 * Recalculate catalog entries, prune redundant records, update hashes, and recompute manifest metadata.
 *
 * @param catalog - Source documentation catalog
 * @param [options={}] - Options for recalculation
 * @returns Updated PatternFlyMcpDocsCatalog
 */
const recalculateManifestMetadata = (
  catalog: PatternFlyMcpDocsCatalog,
  options: RecalculateOptions = {}
): PatternFlyMcpDocsCatalog => {
  const redundantSet = new Set(
    (options.redundantRecords || []).map(
      report => `${report.category}::${report.record.pathSlug}::${report.record.displayName}`
    )
  );

  const updatedDocs: PatternFlyMcpDocsCatalogEntry = {};

  for (const [category, entries] of Object.entries(catalog.docs || {})) {
    const filteredEntries: PatternFlyMcpDocsCatalogDoc[] = [];

    for (const doc of entries) {
      const key = `${category}::${doc.pathSlug}::${doc.displayName}`;

      if (redundantSet.has(key)) {
        continue;
      }

      let updatedPath = doc.path;

      // Update commit hash if new hash is available and doc is not a pinned one-off / v5
      if (options.latestHashes && doc.path && typeof doc.path === 'string') {
        const repoInfo = extractRepoInfo(doc.path);

        if (repoInfo && repoInfo.ref !== 'v5') {
          const repoKey = `${repoInfo.owner}/${repoInfo.repo}`;
          const newSha = options.latestHashes.get(repoKey) || options.latestHashes.get(repoInfo.repo);

          // Update if repo is recognized and ref is a 40-char SHA (primary ref)
          if (newSha && /^[a-f0-9]{40}$/.test(repoInfo.ref)) {
            // Keep specific known one-offs pinned if needed
            const isKnownOneOff =
              repoInfo.ref === 'ec02b437ec72b6e4cc4e28524516288f4acf9fdf' ||
              repoInfo.ref === 'ce032cd16ddb90c540cb4f18c6830e190cd9e3e9' ||
              repoInfo.ref === '402b3b0e7ed73cb2aa21531e0eab4216c2211212' ||
              repoInfo.ref === 'e8cca17430a8ccb062ed1878073165417a081b34';

            if (!isKnownOneOff) {
              updatedPath = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${newSha}/${repoInfo.filePath}`;
            }
          }
        }
      }

      filteredEntries.push({
        ...doc,
        path: updatedPath
      });
    }

    if (filteredEntries.length > 0) {
      updatedDocs[category] = filteredEntries;
    }
  }

  const totalEntries = Object.keys(updatedDocs).length;
  const totalDocs = Object.values(updatedDocs).reduce((acc, arr) => acc + arr.length, 0);

  return {
    version: catalog.version || '1',
    generated: new Date().toISOString(),
    meta: {
      totalEntries,
      totalDocs,
      source: catalog.meta?.source || 'patternfly-mcp'
    },
    docs: updatedDocs
  };
};

export {
  DEFAULT_TRACKED_REPOS,
  diffDocsManifests,
  escapeCsvField,
  extractCommitHash,
  extractRepoInfo,
  fetchLatestRepoHashes,
  findApiRedundantDocs,
  formatCsv,
  generateDocsReportCsv,
  recalculateManifestMetadata,
  verifyUrlReachability,
  type ApiCollectionRecordRef,
  type DocsAddedRecordReport,
  type DocsDiffResult,
  type DocsModifiedRecordReport,
  type DocsRemovedRecordReport,
  type DocsUnchangedRecordReport,
  type GitHubUrlInfo,
  type RecalculateOptions
};

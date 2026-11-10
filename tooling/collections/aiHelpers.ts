import { createHash } from 'node:crypto';
import { parseFrontMatter } from '../../src/resource.helpers';

const AI_HELPERS_DEFAULT_OWNER = 'rh-uxd';
const AI_HELPERS_DEFAULT_REPO = 'ai-helpers';
const MARKETPLACE_JSON_PATH = '.claude-plugin/marketplace.json';
const COLLECTION_VERSION = 'main';
const GIT_BLOB_MODE_SYMLINK = '120000';
const GIT_BLOB_MODE_REGULAR = '100644';
const SHA40_PATTERN = /^[0-9a-f]{40}$/;
const SKILL_RELATIVE_PATH_PATTERN = /\/skills\/[^/]+\/SKILL\.md$/;
const MAX_MARKDOWN_BYTES = 512_000;

const ROOT_OVERVIEW_DOC_NAMES = [
  'README.md',
  'CONTRIBUTING-SKILLS.md',
  'CONTRIBUTING.md',
  'FAQ.md',
  'PLUGINS.md',
  'QUICKSTART.md'
] as const;

const ROOT_OVERVIEW_DOC_NAME_SET = new Set<string>(ROOT_OVERVIEW_DOC_NAMES);

/**
 * Git tree entry returned by the injected repository reader.
 */
interface AiHelpersGitTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  mode: string;
  sha: string;
  size?: number;
}

/**
 * Blob payload returned by the injected repository reader.
 */
interface AiHelpersBlobReadResult {
  path: string;
  sha: string;
  size: number;
  content: string;
}

/**
 * Narrow abstraction for immutable Git tree reads used by the ai-helpers crawler.
 */
interface AiHelpersRepositoryReader {
  resolveRef(ref: string): Promise<string>;
  listTree(commitSha: string, options?: { recursive?: boolean }): Promise<AiHelpersGitTreeEntry[]>;
  readBlob(commitSha: string, path: string): Promise<AiHelpersBlobReadResult>;
}

type AiHelpersRecordKind = 'skill' | 'overview';
type AiHelpersRecordFamily = 'patternfly' | 'uxd';

/**
 * Stable catalog record compatible with PatternFly docs fields plus source metadata.
 */
interface AiHelpersCatalogRecord {
  displayName: string;
  description: string;
  pathSlug: string;
  section: string;
  category: string;
  source: string;
  path: string;
  version: string;
  kind: AiHelpersRecordKind;
  family: AiHelpersRecordFamily;
  plugin: string;
  sourcePath: string;
  sourceBlobSha: string;
  sourceContentHash: string;
}

interface AiHelpersMarketplacePlugin {
  name: string;
  source: string;
  description?: string;
  category?: string;
}

interface AiHelpersMarketplaceJson {
  plugins: AiHelpersMarketplacePlugin[];
}

interface AiHelpersNormalizedPlugin {
  name: string;
  root: string;
}

interface AiHelpersCrawlOptions {
  owner?: string;
  repo?: string;
  ref: string;
}

interface AiHelpersCrawlResult {
  commitSha: string;
  requestedRef: string;
  records: AiHelpersCatalogRecord[];
}

interface AiHelpersCatalogDiff {
  added: AiHelpersCatalogRecord[];
  modified: AiHelpersCatalogRecord[];
  removed: AiHelpersCatalogRecord[];
  unchanged: AiHelpersCatalogRecord[];
}

interface AiHelpersSkillFrontmatter {
  name: string;
  description: string;
}

interface AiHelpersPathRejection {
  path: string;
  reason: string;
}

type AiHelpersCatalogComparableField = keyof Pick<
  AiHelpersCatalogRecord,
  | 'displayName' |
  'description' |
  'path' |
  'sourceBlobSha' |
  'sourceContentHash' |
  'plugin' |
  'family' |
  'kind'
>;

const COMPARABLE_RECORD_FIELDS: AiHelpersCatalogComparableField[] = [
  'displayName',
  'description',
  'path',
  'sourceBlobSha',
  'sourceContentHash',
  'plugin',
  'family',
  'kind'
];

/**
 * @param sha - Git object id or ref fragment
 * @returns True when value is a 40-character lowercase hex SHA
 */
const isStableSha = (sha: string): boolean => SHA40_PATTERN.test(sha);

/**
 * @param ref - Requested ref
 * @returns Error when ref is not a non-empty string
 */
const assertRequestedRef = (ref: string): void => {
  if (!ref || typeof ref !== 'string' || !ref.trim()) {
    throw new Error('A non-empty Git ref is required to crawl ai-helpers.');
  }
};

/**
 * @param value - Plugin marketplace source path
 * @returns Repository-relative plugin root without leading `./`
 */
const normalizePluginSourceRoot = (value: string): string | undefined => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim().replace(/^\.\//, '').replace(/\/+$/, '');

  if (!trimmed || trimmed.includes('..') || trimmed.startsWith('/')) {
    return undefined;
  }

  return trimmed;
};

/**
 * @param marketplace - Parsed marketplace JSON
 * @returns Sorted, de-duplicated plugin roots (longest roots first for assignment)
 */
const derivePluginRootsFromMarketplace = (marketplace: unknown): AiHelpersNormalizedPlugin[] => {
  if (!marketplace || typeof marketplace !== 'object' || !('plugins' in marketplace)) {
    throw new Error('Invalid marketplace.json: missing plugins array.');
  }

  const pluginsRaw = (marketplace as AiHelpersMarketplaceJson).plugins;

  if (!Array.isArray(pluginsRaw)) {
    throw new Error('Invalid marketplace.json: plugins must be an array.');
  }

  const byRoot = new Map<string, AiHelpersNormalizedPlugin>();

  for (const plugin of pluginsRaw) {
    if (!plugin || typeof plugin !== 'object') {
      continue;
    }

    const name = typeof plugin.name === 'string' ? plugin.name.trim() : '';
    const root = normalizePluginSourceRoot(plugin.source || '');

    if (!name || !root) {
      continue;
    }

    if (!byRoot.has(root)) {
      byRoot.set(root, { name, root });
    }
  }

  return [...byRoot.values()].sort((a, b) => b.root.length - a.root.length || a.name.localeCompare(b.name));
};

/**
 * @param sourcePath - Repository-relative path
 * @returns Rejection reason or undefined when structurally safe
 */
const getUnsafePathReason = (sourcePath: string): string | undefined => {
  if (!sourcePath || typeof sourcePath !== 'string') {
    return 'empty path';
  }

  if (sourcePath.startsWith('/') || sourcePath.includes('..') || /%2e/i.test(sourcePath)) {
    return 'path traversal';
  }

  if (sourcePath.includes('\\')) {
    return 'non-repository path separators';
  }

  const segments = sourcePath.split('/');

  if (segments.some(segment => segment === '' && sourcePath !== '')) {
    return 'empty path segment';
  }

  // cspell:ignore fullsend evals — upstream repo directory names excluded by the crawler
  const blockedSegmentRoots = ['.fullsend', '.github', 'scripts', 'evals', 'assets'];

  if (segments.some(segment => blockedSegmentRoots.includes(segment))) {
    return 'blocked repository segment';
  }

  const basename = segments[segments.length - 1] || '';

  if (basename === 'AGENTS.md' || basename === 'CLAUDE.md') {
    return 'agent instruction document';
  }

  if (sourcePath.startsWith('agent-docs/') || sourcePath.includes('/agent-docs/')) {
    return 'agent docs path';
  }

  return undefined;
};

/**
 * @param sourcePath - Repository-relative markdown path
 * @returns True when path is one of the six approved repository-root overview documents
 */
const isApprovedRootOverviewPath = (sourcePath: string): boolean =>
  ROOT_OVERVIEW_DOC_NAME_SET.has(sourcePath);

/**
 * @param sourcePath - Repository-relative path
 * @param pluginRoots - Normalized marketplace plugin roots
 * @returns Matching plugin for a skill path, preferring the longest root
 */
const resolvePluginForSkillPath = (
  sourcePath: string,
  pluginRoots: AiHelpersNormalizedPlugin[]
): AiHelpersNormalizedPlugin | undefined => {
  if (!SKILL_RELATIVE_PATH_PATTERN.test(sourcePath)) {
    return undefined;
  }

  return pluginRoots.find(plugin => sourcePath.startsWith(`${plugin.root}/`));
};

/**
 * @param sourcePath - Repository-relative skill path
 * @returns PatternFly vs UXD family classification
 */
const classifySkillFamily = (sourcePath: string): AiHelpersRecordFamily | undefined => {
  if (sourcePath.startsWith('plugins/patternfly/')) {
    return 'patternfly';
  }

  if (/^plugins\/uxd-[^/]+\//.test(sourcePath)) {
    return 'uxd';
  }

  return undefined;
};

/**
 * @param owner - GitHub owner
 * @param repo - GitHub repository
 * @param commitSha - Resolved 40-character commit SHA
 * @param sourcePath - File path within the repository
 * @returns Immutable raw GitHub content URL or throws when SHA is not pinned
 */
const buildPinnedRawGitHubUrl = (
  owner: string,
  repo: string,
  commitSha: string,
  sourcePath: string
): string => {
  if (!isStableSha(commitSha)) {
    throw new Error(`Raw GitHub URLs must be pinned to a 40-character SHA; received "${commitSha}".`);
  }

  const unsafe = getUnsafePathReason(sourcePath);

  if (unsafe) {
    throw new Error(`Cannot build URL for unsafe path "${sourcePath}": ${unsafe}`);
  }

  return `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${sourcePath}`;
};

/**
 * @param content - Markdown file body
 * @returns SHA-256 content hash for diffing
 */
const hashContent = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

/**
 * @param slug - Candidate slug segment
 * @returns Lowercase kebab-case slug
 */
const toKebabSlug = (slug: string): string =>
  slug
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

/**
 * @param name - Skill name from frontmatter
 * @returns Stable docs-compatible path slug
 */
const buildSkillPathSlug = (name: string): string => {
  const kebab = toKebabSlug(name);

  if (!kebab) {
    throw new Error('Skill name did not produce a valid path slug.');
  }

  return `ai-helpers-skill-${kebab}`;
};

/**
 * @param filename - Root overview filename
 * @returns Stable slug aligned with existing uxd-ai-helpers-* entries
 */
const buildOverviewPathSlug = (filename: string): string => {
  const base = filename.replace(/\.md$/i, '').toLowerCase();

  if (base === 'readme') {
    return 'uxd-ai-helpers-readme';
  }

  return `uxd-ai-helpers-${toKebabSlug(base)}`;
};

/**
 * @param markdown - Skill SKILL.md content
 * @returns Parsed name and description or throws for invalid frontmatter
 */
const parseSkillFrontmatter = (markdown: string): AiHelpersSkillFrontmatter => {
  if (typeof markdown !== 'string' || markdown.includes('\0')) {
    throw new Error('Skill markdown must be a UTF-8 string without binary content.');
  }

  let frontMatter: Record<string, string>;

  try {
    ({ frontMatter } = parseFrontMatter(markdown));
  } catch {
    throw new Error('Skill frontmatter is not valid YAML.');
  }

  const name = frontMatter.name?.trim() || '';
  const description = frontMatter.description?.trim() || '';

  if (!name) {
    throw new Error('Skill frontmatter requires a non-empty name.');
  }

  if (!description) {
    throw new Error('Skill frontmatter requires a non-empty description.');
  }

  return { name, description };
};

/**
 * @param sourcePath - Admitted path from marketplace discovery
 * @param reason - Validation failure summary
 */
const throwAdmittedCandidateError = (sourcePath: string, reason: string): never => {
  throw new Error(`Admitted ai-helpers candidate "${sourcePath}" failed validation: ${reason}`);
};

/**
 * @param entry - Git tree entry
 * @returns Rejection for non-regular markdown blobs
 */
const getTreeEntryRejection = (entry: AiHelpersGitTreeEntry): string | undefined => {
  const unsafe = getUnsafePathReason(entry.path);

  if (unsafe) {
    return unsafe;
  }

  if (entry.type !== 'blob') {
    return 'non-blob tree entry';
  }

  if (entry.mode === GIT_BLOB_MODE_SYMLINK) {
    return 'symlink';
  }

  if (entry.mode !== GIT_BLOB_MODE_REGULAR) {
    return 'non-regular blob mode';
  }

  if (typeof entry.size === 'number' && entry.size > MAX_MARKDOWN_BYTES) {
    return 'oversized blob';
  }

  if (!entry.path.endsWith('.md')) {
    return 'non-markdown blob';
  }

  return undefined;
};

/**
 * @param tree - Repository tree listing
 * @param pluginRoots - Marketplace plugin roots
 * @returns Deduplicated skill paths with assigned plugin metadata
 */
const discoverSkillPaths = (
  tree: AiHelpersGitTreeEntry[],
  pluginRoots: AiHelpersNormalizedPlugin[]
): Map<string, AiHelpersNormalizedPlugin> => {
  const discovered = new Map<string, AiHelpersNormalizedPlugin>();

  for (const entry of tree) {
    const treeRejection = getTreeEntryRejection(entry);

    if (treeRejection || !entry.path.endsWith('/SKILL.md')) {
      continue;
    }

    const plugin = resolvePluginForSkillPath(entry.path, pluginRoots);

    if (!plugin || discovered.has(entry.path)) {
      continue;
    }

    discovered.set(entry.path, plugin);
  }

  return discovered;
};

/**
 * @param tree - Repository tree listing
 * @returns Approved root overview paths present in the tree
 */
const discoverRootOverviewPaths = (tree: AiHelpersGitTreeEntry[]): string[] => {
  const found: string[] = [];

  for (const entry of tree) {
    if (getTreeEntryRejection(entry)) {
      continue;
    }

    if (isApprovedRootOverviewPath(entry.path)) {
      found.push(entry.path);
    }
  }

  return [...new Set(found)].sort((a, b) => a.localeCompare(b));
};

/**
 * @param record - Fully built catalog record
 * @param slugCounts - Mutable duplicate slug counter
 * @returns Error message when slug duplicates another admitted record
 */
const registerSlug = (record: AiHelpersCatalogRecord, slugCounts: Map<string, number>): string | undefined => {
  const count = (slugCounts.get(record.pathSlug) || 0) + 1;

  slugCounts.set(record.pathSlug, count);

  if (count > 1) {
    return `duplicate pathSlug "${record.pathSlug}"`;
  }

  return undefined;
};

/**
 * @param left - Prior record
 * @param right - Next record
 * @returns True when comparable fields differ
 */
const recordsAreEquivalent = (left: AiHelpersCatalogRecord, right: AiHelpersCatalogRecord): boolean =>
  COMPARABLE_RECORD_FIELDS.every(field => left[field] === right[field]);

/**
 * @param reader - Injected repository reader
 * @param options - Crawl configuration
 * @returns SHA-pinned catalog records in deterministic order
 */
const crawlAiHelpersCatalog = async (
  reader: AiHelpersRepositoryReader,
  options: AiHelpersCrawlOptions
): Promise<AiHelpersCrawlResult> => {
  assertRequestedRef(options.ref);

  const owner = options.owner || AI_HELPERS_DEFAULT_OWNER;
  const repo = options.repo || AI_HELPERS_DEFAULT_REPO;

  const commitSha = await reader.resolveRef(options.ref);

  if (!isStableSha(commitSha)) {
    throw new Error(`Repository reader must resolve refs to a 40-character SHA; received "${commitSha}".`);
  }

  const marketplaceBlob = await reader.readBlob(commitSha, MARKETPLACE_JSON_PATH);
  let marketplaceJson: unknown;

  try {
    marketplaceJson = JSON.parse(marketplaceBlob.content) as unknown;
  } catch {
    throw new Error('marketplace.json is not valid JSON.');
  }

  const pluginRoots = derivePluginRootsFromMarketplace(marketplaceJson);
  const tree = await reader.listTree(commitSha, { recursive: true });
  const skillPaths = discoverSkillPaths(tree, pluginRoots);
  const overviewPaths = discoverRootOverviewPaths(tree);
  const slugCounts = new Map<string, number>();
  const records: AiHelpersCatalogRecord[] = [];
  const rejections: AiHelpersPathRejection[] = [];

  for (const [sourcePath, plugin] of [...skillPaths.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const family = classifySkillFamily(sourcePath) || throwAdmittedCandidateError(sourcePath, 'unclassified skill family');

    const blob = await reader.readBlob(commitSha, sourcePath).catch((error: unknown) =>
      throwAdmittedCandidateError(
        sourcePath,
        error instanceof Error ? error.message : 'blob read failed'
      ));

    if (blob.size > MAX_MARKDOWN_BYTES || blob.content.includes('\0')) {
      throwAdmittedCandidateError(
        sourcePath,
        blob.content.includes('\0') ? 'binary content' : 'oversized blob'
      );
    }

    const frontmatter = (() => {
      try {
        return parseSkillFrontmatter(blob.content);
      } catch (error) {
        return throwAdmittedCandidateError(
          sourcePath,
          error instanceof Error ? error.message : 'invalid skill frontmatter'
        );
      }
    })();

    const record: AiHelpersCatalogRecord = {
      displayName: frontmatter.name,
      description: frontmatter.description,
      pathSlug: buildSkillPathSlug(frontmatter.name),
      section: 'skills',
      category: family === 'patternfly' ? 'patternfly' : 'uxd',
      source: `${owner}/${repo}`,
      path: buildPinnedRawGitHubUrl(owner, repo, commitSha, sourcePath),
      version: COLLECTION_VERSION,
      kind: 'skill',
      family,
      plugin: plugin.name,
      sourcePath,
      sourceBlobSha: blob.sha,
      sourceContentHash: hashContent(blob.content)
    };

    const duplicate = registerSlug(record, slugCounts);

    if (duplicate) {
      throwAdmittedCandidateError(sourcePath, duplicate);
    }

    records.push(record);
  }

  for (const sourcePath of overviewPaths) {
    const blob = await reader.readBlob(commitSha, sourcePath).catch((error: unknown) =>
      throwAdmittedCandidateError(
        sourcePath,
        error instanceof Error ? error.message : 'blob read failed'
      ));

    if (blob.size > MAX_MARKDOWN_BYTES || blob.content.includes('\0')) {
      throwAdmittedCandidateError(
        sourcePath,
        blob.content.includes('\0') ? 'binary content' : 'oversized blob'
      );
    }

    const displayName = sourcePath.replace(/\.md$/i, '');
    const record: AiHelpersCatalogRecord = {
      displayName,
      description: `Public ai-helpers overview: ${displayName}.`,
      pathSlug: buildOverviewPathSlug(sourcePath),
      section: 'overview',
      category: 'reference',
      source: `${owner}/${repo}`,
      path: buildPinnedRawGitHubUrl(owner, repo, commitSha, sourcePath),
      version: COLLECTION_VERSION,
      kind: 'overview',
      family: 'uxd',
      plugin: 'repository-root',
      sourcePath,
      sourceBlobSha: blob.sha,
      sourceContentHash: hashContent(blob.content)
    };

    const duplicate = registerSlug(record, slugCounts);

    if (duplicate) {
      throwAdmittedCandidateError(sourcePath, duplicate);
    }

    records.push(record);
  }

  for (const entry of tree) {
    if (entry.type === 'blob' && SKILL_RELATIVE_PATH_PATTERN.test(entry.path) && !skillPaths.has(entry.path)) {
      rejections.push({ path: entry.path, reason: 'skill path is not published by marketplace.json' });
      continue;
    }

    const rejection = getTreeEntryRejection(entry);

    if (!rejection) {
      continue;
    }

    if (
      skillPaths.has(entry.path) ||
      isApprovedRootOverviewPath(entry.path) ||
      entry.path === MARKETPLACE_JSON_PATH
    ) {
      continue;
    }

    if (entry.path.endsWith('.md') || entry.path.includes('/skills/')) {
      rejections.push({ path: entry.path, reason: rejection });
    }
  }

  records.sort((a, b) => a.pathSlug.localeCompare(b.pathSlug) || a.sourcePath.localeCompare(b.sourcePath));

  if (records.length === 0) {
    throw new Error('ai-helpers crawl produced no catalog records.');
  }

  return {
    commitSha,
    requestedRef: options.ref,
    records
  };
};

/**
 * @param previous - Prior catalog snapshot
 * @param next - New catalog snapshot
 * @returns Semantic add/change/remove classes for reseed reporting
 */
const diffAiHelpersCatalogs = (
  previous: AiHelpersCatalogRecord[],
  next: AiHelpersCatalogRecord[]
): AiHelpersCatalogDiff => {
  const previousBySlug = new Map(previous.map(record => [record.pathSlug, record]));
  const nextBySlug = new Map(next.map(record => [record.pathSlug, record]));
  const added: AiHelpersCatalogRecord[] = [];
  const modified: AiHelpersCatalogRecord[] = [];
  const removed: AiHelpersCatalogRecord[] = [];
  const unchanged: AiHelpersCatalogRecord[] = [];

  for (const record of next) {
    const prior = previousBySlug.get(record.pathSlug);

    if (!prior) {
      added.push(record);
      continue;
    }

    if (recordsAreEquivalent(prior, record)) {
      unchanged.push(record);
    } else {
      modified.push(record);
    }
  }

  for (const record of previous) {
    if (!nextBySlug.has(record.pathSlug)) {
      removed.push(record);
    }
  }

  const sortBySlug = (a: AiHelpersCatalogRecord, b: AiHelpersCatalogRecord) =>
    a.pathSlug.localeCompare(b.pathSlug);

  return {
    added: [...added].sort(sortBySlug),
    modified: [...modified].sort(sortBySlug),
    removed: [...removed].sort(sortBySlug),
    unchanged: [...unchanged].sort(sortBySlug)
  };
};

export {
  AI_HELPERS_DEFAULT_OWNER,
  AI_HELPERS_DEFAULT_REPO,
  ROOT_OVERVIEW_DOC_NAMES,
  MARKETPLACE_JSON_PATH,
  buildPinnedRawGitHubUrl,
  classifySkillFamily,
  crawlAiHelpersCatalog,
  derivePluginRootsFromMarketplace,
  diffAiHelpersCatalogs,
  discoverSkillPaths,
  getUnsafePathReason,
  isApprovedRootOverviewPath,
  isStableSha,
  parseSkillFrontmatter,
  type AiHelpersBlobReadResult,
  type AiHelpersCatalogDiff,
  type AiHelpersCatalogRecord,
  type AiHelpersCrawlOptions,
  type AiHelpersCrawlResult,
  type AiHelpersGitTreeEntry,
  type AiHelpersRepositoryReader
};

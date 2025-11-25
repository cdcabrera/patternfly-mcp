#!/usr/bin/env node

/**
 * Generate PatternFly documentation index JSON from patternfly-org repository
 *
 * This script dynamically discovers the repository structure and infers types,
 * categories, and component names from the actual directory layout.
 *
 * Usage:
 *   npm run build:resources
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, normalize, relative } from 'path';
import { existsSync, rmSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import fg from 'fast-glob';
import packageJson from '../package.json';

/**
 * Type of content - dynamically inferred from directory structure
 */
type ContentType =
  'component' |
  'pattern' |
  'foundation' |
  'layout' |
  'extension' |
  'component-group' |
  'chart' |
  'topology' |
  'accessibility' |
  'content-design' |
  'guide';

type DocType = 'design' | 'accessibility' | 'examples';

interface VersionDocs {
  design: string | null;
  accessibility: string | null;
  examples: string | null;
  available: boolean;
}

interface ComponentDoc {
  component: string;
  type: ContentType;
  category: string;
  aliases?: string[];
  deprecated?: boolean;
  docs: Record<string, VersionDocs>;
}

type DocsIndex = Record<string, ComponentDoc>;

interface DocsIndexWithMetadata {
  generatedAt: string;
  packageVersion: string;
  total: number;
  byType: Record<string, number>;
  documents: DocsIndex;
}

// Configuration - only hardcode what's truly necessary
const ROOT_DIR = process.cwd();
const OUTPUT = join(ROOT_DIR, 'src/docs.index.json');
const DEFAULT_VERSION = '6';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/patternfly/patternfly-org/main';
const GITHUB_REPO = 'https://github.com/patternfly/patternfly-org.git';
const CONTENT_BASE_PATH = 'packages/documentation-site/patternfly-docs/content';
const TEMP_DIR = join(ROOT_DIR, 'tmp');
const SOURCE = join(TEMP_DIR, 'patternfly-org');
const TIMESTAMP_FILE = join(TEMP_DIR, 'patternfly-org-clone-timestamp.txt');
const CLONE_MAX_AGE_DAYS = 3;
const CLONE_MAX_AGE_MS = CLONE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// Path segments to ignore when extracting directories
const IGNORED_PATH_SEGMENTS = new Set([
  'packages',
  'documentation-site',
  'patternfly-docs',
  'content',
  '.',
  '..',
  'img',
  'node_modules'
]);

// Minimal type normalization - only for special cases that need mapping
// Everything else uses directory name as-is
const TYPE_NORMALIZATION: Record<string, ContentType> = {
  'foundations-and-styles': 'foundation',
  'get-started': 'guide',
  'developer-guides': 'guide'
};

// Known ContentType values - used for type matching
const KNOWN_CONTENT_TYPES = new Set<ContentType>([
  'component',
  'pattern',
  'foundation',
  'layout',
  'extension',
  'component-group',
  'chart',
  'topology',
  'accessibility',
  'content-design',
  'guide'
]);

// Known doc type subdirectories - discovered dynamically but these are common
const KNOWN_DOC_TYPE_DIRS = new Set(['accessibility', 'examples']);

// Alias abbreviations - user-facing, less critical but kept for convenience
const ALIAS_ABBREVIATIONS: Record<string, string[]> = {
  Button: ['btn'],
  Table: ['tbl', 'data-table', 'datatable', 'grid-table'],
  Accordion: ['accordian'], // Common misspelling
  SearchInput: ['search', 'search-input'],
  TextInput: ['text', 'input', 'text-input'],
  DataList: ['datalist', 'list'],
  FormSelect: ['select', 'dropdown-select'],
  ApplicationLauncher: ['app-launcher', 'launcher'],
  NotificationDrawer: ['notification', 'drawer'],
  Page: ['page-layout'],
  Masthead: ['header', 'topbar'],
  Sidebar: ['nav', 'navigation']
};

/**
 * Convert kebab-case to camelCase for type normalization
 */
function kebabToCamelCase(str: string): string {
  return str
    .split('-')
    .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Discover top-level directories in content directory using fast-glob
 * This builds the type mapping dynamically from actual structure
 */
async function discoverTopLevelDirectories(contentDir: string): Promise<Set<string>> {
  const directories = new Set<string>();

  try {
    // Use fast-glob to find top-level directories
    const dirs = await fg('*/', {
      cwd: contentDir,
      onlyDirectories: true,
      absolute: false
    });

    dirs.forEach((dir) => {
      const dirName = dir.replace(/\/$/, '');

      if (!IGNORED_PATH_SEGMENTS.has(dirName)) {
        directories.add(dirName);
      }
    });
  } catch (error) {
    console.warn(`Warning: Could not read content directory ${contentDir}: ${error}`);
  }

  return directories;
}

/**
 * Normalize directory name to ContentType
 * Uses minimal normalization map, falls back to directory name
 */
function normalizeDirectoryToType(dirName: string): ContentType {
  // Check normalization map first
  if (TYPE_NORMALIZATION[dirName]) {
    return TYPE_NORMALIZATION[dirName];
  }

  // Special case: layouts under foundations-and-styles
  if (dirName === 'foundations-and-styles') {
    return 'foundation';
  }

  // Try to match known ContentType values
  const normalized = kebabToCamelCase(dirName);

  // If it matches a known type, use it
  if (KNOWN_CONTENT_TYPES.has(normalized as ContentType)) {
    return normalized as ContentType;
  }

  // Default to component for unknown directories
  return 'component';
}

/**
 * Parse path to determine type and category - dynamically inferred
 */
function parsePathToType(
  path: string,
  topLevelDirs: Set<string>
): { type: ContentType; category: string; isAccessibility: boolean } | null {
  const normalizedPath = path.replace(/\\/g, '/');
  const isAccessibility = normalizedPath.includes('/accessibility/');
  const parts = normalizedPath.split('/');

  // Find the first top-level directory in the path
  let topLevelDir: string | undefined;

  for (const part of parts) {
    if (topLevelDirs.has(part)) {
      topLevelDir = part;
      break;
    }
  }

  // If no top-level dir found, try to find any non-ignored directory
  if (!topLevelDir) {
    topLevelDir = parts.find(p => p && !p.startsWith('.') && !IGNORED_PATH_SEGMENTS.has(p));
  }

  if (!topLevelDir) {
    return null;
  }

  // Special case: layouts are under foundations-and-styles
  if (topLevelDir === 'foundations-and-styles' && normalizedPath.includes('layouts/')) {
    return { type: 'layout', category: 'layout', isAccessibility };
  }

  // Normalize directory name to type
  const type = normalizeDirectoryToType(topLevelDir);

  return {
    type,
    category: topLevelDir,
    isAccessibility
  };
}

/**
 * Extract component name using generic strategy
 * Uses directory name or filename, whichever is more specific
 */
function extractComponentName(path: string, type: ContentType): string {
  const normalizedPath = path.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const fileName = basename(path, '.md');

  // Remove ignored segments and file extension
  const relevantParts = parts.filter(p =>
    p &&
    !p.startsWith('.') &&
    !IGNORED_PATH_SEGMENTS.has(p) &&
    !p.endsWith('.md') &&
    !KNOWN_DOC_TYPE_DIRS.has(p) // Skip doc type directories
  );

  // Strategy: use the most specific directory name (last relevant part before filename)
  // If that's the same as filename, use filename
  if (relevantParts.length >= 2) {
    const dirName = relevantParts[relevantParts.length - 1];

    if (dirName && dirName !== fileName && !dirName.includes('.')) {
      return toPascalCase(dirName);
    }
  }

  // Fallback: use filename
  return toPascalCase(fileName);
}

/**
 * Determine doc type from path - dynamically checks subdirectory structure
 */
function determineDocType(path: string): DocType {
  const normalizedPath = path.replace(/\\/g, '/');

  // Check for known doc type subdirectories
  for (const docTypeDir of KNOWN_DOC_TYPE_DIRS) {
    if (normalizedPath.includes(`/${docTypeDir}/`)) {
      return docTypeDir as DocType;
    }
  }

  // Default to design
  return 'design';
}

/**
 * Generate aliases for a component name
 */
function generateAliases(componentName: string): string[] {
  const aliases = new Set<string>();

  // Lowercase version
  aliases.add(componentName.toLowerCase());

  // Hyphenated version (PascalCase -> kebab-case)
  const hyphenated = componentName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');

  if (hyphenated !== componentName.toLowerCase()) {
    aliases.add(hyphenated);
  }

  // Add abbreviations if available
  if (ALIAS_ABBREVIATIONS[componentName]) {
    ALIAS_ABBREVIATIONS[componentName].forEach(alias => aliases.add(alias));
  }

  return Array.from(aliases);
}

/**
 * Build GitHub raw URL using URL constructor
 */
function buildGitHubUrl(relativePath: string): string {
  // Normalize path separators and remove leading ./ or ../
  const normalized = relativePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '');

  // Remove any CONTENT_BASE_PATH prefix if present
  const cleanPath = normalized.replace(new RegExp(`^${CONTENT_BASE_PATH}/?`), '');
  const url = new URL(`${CONTENT_BASE_PATH}/${cleanPath}`, GITHUB_RAW_BASE);

  return url.toString();
}

/**
 * Find all markdown files using fast-glob
 */
async function findMarkdownFiles(repoRoot: string): Promise<string[]> {
  try {
    return await fg(`${CONTENT_BASE_PATH}/**/*.md`, {
      cwd: repoRoot,
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/img/**',
        '**/.*/**',
        '**/.git/**'
      ]
    });
  } catch (error) {
    console.warn(`Warning: Could not find markdown files in ${repoRoot}: ${error}`);
    return [];
  }
}

/**
 * Check if the clone is older than the maximum age
 */
async function isCloneExpired(): Promise<boolean> {
  if (!existsSync(SOURCE) || !existsSync(TIMESTAMP_FILE)) {
    return true;
  }

  try {
    const timestampContent = await readFile(TIMESTAMP_FILE, 'utf-8');
    const cloneTimestamp = parseInt(timestampContent.trim(), 10);

    if (isNaN(cloneTimestamp)) {
      return true;
    }

    return (Date.now() - cloneTimestamp) > CLONE_MAX_AGE_MS;
  } catch {
    return true;
  }
}

/**
 * Update the clone timestamp file
 */
async function updateCloneTimestamp(): Promise<void> {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }

  await writeFile(TIMESTAMP_FILE, Date.now().toString(), 'utf-8');
}

/**
 * Clone patternfly-org repository to a temporary directory
 */
async function cloneRepository(targetDir: string): Promise<void> {
  console.log(`Cloning patternfly-org repository to: ${targetDir}`);

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  const parentDir = join(targetDir, '..');

  if (!existsSync(parentDir)) {
    await mkdir(parentDir, { recursive: true });
  }

  try {
    execSync(
      `git clone --depth 1 --branch main ${GITHUB_REPO} "${targetDir}"`,
      { stdio: 'inherit' }
    );
    console.log('✅ Repository cloned successfully');
    await updateCloneTimestamp();
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error}`);
  }
}

/**
 * Create combined index with metadata
 */
function createIndexWithMetadata(index: DocsIndex): DocsIndexWithMetadata {
  const byType: Record<string, number> = {};

  Object.values(index).forEach(entry => {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  });

  return {
    generatedAt: new Date().toISOString(),
    packageVersion: packageJson.version,
    total: Object.keys(index).length,
    byType,
    documents: index
  };
}

/**
 * Generate the documentation index
 */
async function generateIndex(): Promise<DocsIndex> {
  const expired = await isCloneExpired();

  if (expired || !existsSync(join(SOURCE, CONTENT_BASE_PATH))) {
    if (expired && existsSync(SOURCE)) {
      console.log(`🔄 Clone is older than ${CLONE_MAX_AGE_DAYS} day(s), refreshing...`);
    }
    await cloneRepository(SOURCE);
  }

  const contentDir = join(SOURCE, CONTENT_BASE_PATH);

  if (!existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}\nPlease ensure patternfly-org is cloned to: ${SOURCE}`);
  }

  // Discover top-level directories dynamically
  console.log('🔍 Discovering repository structure...');
  const topLevelDirs = await discoverTopLevelDirectories(contentDir);
  console.log(`   Found ${topLevelDirs.size} top-level directories: ${Array.from(topLevelDirs).join(', ')}`);

  console.log(`Discovering markdown files in: ${CONTENT_BASE_PATH}`);
  const markdownFiles = await findMarkdownFiles(SOURCE);
  console.log(`Found ${markdownFiles.length} markdown files`);

  const index: DocsIndex = {};

  for (const filePath of markdownFiles) {
    // Calculate relative path from contentDir
    const relativePath = relative(contentDir, filePath).replace(/\\/g, '/').replace(/^\.\//, '');

    const typeInfo = parsePathToType(relativePath, topLevelDirs);

    if (!typeInfo) {
      console.warn(`Skipping file (could not determine type): ${relativePath}`);
      continue;
    }

    const { type, category } = typeInfo;
    const componentName = extractComponentName(relativePath, type);
    const docType = determineDocType(relativePath);

    // Get or create component entry using nullish coalescing
    index[componentName] ??= {
      component: componentName,
      type,
      category,
      aliases: generateAliases(componentName),
      deprecated: false,
      docs: {}
    };

    const entry = index[componentName];

    // Handle type upgrades (accessibility -> component)
    if (entry.type === 'accessibility' && type === 'component') {
      entry.type = type;
      entry.category = category;
    }

    // Ensure version entry exists
    entry.docs[DEFAULT_VERSION] ??= {
      design: null,
      accessibility: null,
      examples: null,
      available: false
    };

    // Set URL using docType as property key
    const versionDocs = entry.docs[DEFAULT_VERSION];
    versionDocs[docType] = buildGitHubUrl(relativePath);
    versionDocs.available = Boolean(versionDocs.design || versionDocs.accessibility || versionDocs.examples);
  }

  return index;
}

/**
 * Main execution
 */
async function main() {
  try {
    const initialMessage = [
      'Generating PatternFly documentation index...',
      `Source: ${SOURCE}`,
      `Output: ${OUTPUT}`
    ];

    console.log(initialMessage.join('\n'));

    const index = await generateIndex();
    const indexWithMetadata = createIndexWithMetadata(index);
    const jsonContent = JSON.stringify(indexWithMetadata, null, 2);

    await writeFile(OUTPUT, jsonContent, 'utf-8');

    // Log stats
    const statsMessage = [
      `\n📊 Documentation Index Stats:`,
      `  Total entries: ${indexWithMetadata.total}`,
      `  Generated at: ${indexWithMetadata.generatedAt}`,
      `  Package version: ${indexWithMetadata.packageVersion}`,
      `  Entries by type:`,
      ...Object.entries(indexWithMetadata.byType)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => `    ${type}: ${count}`),
      `\n✅ Generated index with ${indexWithMetadata.total} entries`,
      `📄 Output written to: ${OUTPUT}`
    ];

    console.log(statsMessage.join('\n'));
  } catch (error) {
    console.error('Error generating index:', error);
    process.exit(1);
  }
}

main();

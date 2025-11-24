#!/usr/bin/env node

/**
 * Generate PatternFly documentation index JSON from patternfly-org repository
 *
 * This script:
 * 1. Discovers all markdown files in the patternfly-org repository
 * 2. Parses paths to determine component names, types, and categories
 * 3. Generates aliases automatically
 * 4. Creates version-specific documentation URLs
 * 5. Outputs a JSON index file with metadata
 * 6. Sets process.env.PF_DOCS_STATS for runtime access
 *
 * Usage:
 *   npm run build:resources
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, relative } from 'path';
import { existsSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import fg from 'fast-glob';
import packageJson from '../package.json';

// Types
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

// Configuration
const ROOT_DIR = process.cwd();
const OUTPUT = join(ROOT_DIR, 'src/docs.index.json');
const DEFAULT_VERSION = '6';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/patternfly/patternfly-org/main';
const GITHUB_REPO = 'https://github.com/patternfly/patternfly-org.git';
const CONTENT_BASE_PATH = 'packages/documentation-site/patternfly-docs/content';
const TEMP_DIR = join(ROOT_DIR, 'tmp');
const SOURCE = join(TEMP_DIR, 'patternfly-org');
const TIMESTAMP_FILE = join(TEMP_DIR, 'patternfly-org-clone-timestamp.txt');
const CLONE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

// Path type mapping: path segment -> { type, category }
const PATH_TYPE_MAP: Record<string, { type: ContentType; category: string }> = {
  'patterns': { type: 'pattern', category: 'pattern' },
  'components': { type: 'component', category: 'component' },
  'foundations-and-styles': { type: 'foundation', category: 'foundation' },
  'layouts': { type: 'layout', category: 'layout' },
  'extensions': { type: 'extension', category: 'extension' },
  'component-groups': { type: 'component-group', category: 'component-group' },
  'accessibility': { type: 'accessibility', category: 'accessibility' },
  'content-design': { type: 'content-design', category: 'content-design' },
  'get-started': { type: 'guide', category: 'guide' },
  'developer-guides': { type: 'guide', category: 'guide' },
  'AI': { type: 'guide', category: 'AI' }
};

// Component name extraction rules: type -> extraction strategy
type NameExtractionStrategy = 'directory' | 'filename' | 'parent-directory' | 'last-segment';

const COMPONENT_NAME_EXTRACTION: Record<ContentType, NameExtractionStrategy> = {
  'pattern': 'directory',
  'layout': 'filename',
  'component': 'directory',
  'foundation': 'last-segment',
  'extension': 'directory',
  'component-group': 'directory',
  'chart': 'directory',
  'topology': 'directory',
  'accessibility': 'directory',
  'content-design': 'directory',
  'guide': 'parent-directory'
};

// Doc type path patterns
const DOC_TYPE_PATTERNS: Record<DocType, string[]> = {
  'accessibility': ['/accessibility/'],
  'examples': ['/examples/'],
  'design': [] // Default, no pattern needed
};

// Alias abbreviations map
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

// Path segments to ignore when extracting top-level directory
const IGNORED_PATH_SEGMENTS = new Set([
  'packages',
  'documentation-site',
  'patternfly-docs',
  'content',
  '.',
  '..'
]);

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
 * Parse path to determine type and category using lookup map
 */
function parsePathToType(path: string): { type: ContentType; category: string; isAccessibility: boolean } | null {
  const normalizedPath = path.replace(/\\/g, '/');
  const isAccessibility = normalizedPath.includes('/accessibility/');

  // Check lookup map first
  for (const [segment, config] of Object.entries(PATH_TYPE_MAP)) {
    if (normalizedPath.includes(`${segment}/`) || normalizedPath.startsWith(`${segment}/`)) {
      // Special case: layouts are under foundations-and-styles
      if (segment === 'foundations-and-styles' && normalizedPath.includes('layouts/')) {
        return { type: 'layout', category: 'layout', isAccessibility };
      }
      return { ...config, isAccessibility };
    }
  }

  // Fallback: use top-level directory name
  const parts = normalizedPath.split('/');
  const topLevelDir = parts.find(p => p && !p.startsWith('.') && !IGNORED_PATH_SEGMENTS.has(p));

  if (!topLevelDir) {
    return null;
  }

  // Default to component type with path-based category
  return {
    type: 'component',
    category: topLevelDir,
    isAccessibility
  };
}

/**
 * Extract component name using configured strategy
 */
function extractComponentName(path: string, type: ContentType): string {
  const normalizedPath = path.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const fileName = basename(path, '.md');
  const strategy = COMPONENT_NAME_EXTRACTION[type];

  switch (strategy) {
    case 'directory': {
      // Find the directory after the type segment
      const typeSegment = Object.keys(PATH_TYPE_MAP).find(seg => normalizedPath.includes(`${seg}/`));
      if (typeSegment) {
        const typeIndex = parts.indexOf(typeSegment);
        if (typeIndex >= 0 && parts[typeIndex + 1]) {
          let dirIndex = typeIndex + 1;
          // Skip accessibility subdirectory for components
          if (type === 'component' && parts[dirIndex] === 'accessibility') {
            dirIndex += 1;
          }
          const dirName = parts[dirIndex];
          if (dirName) {
            return toPascalCase(dirName);
          }
        }
      }
      // Fallback to parent directory
      const dirName = parts[parts.length - 2];
      return dirName && !dirName.includes('.') ? toPascalCase(dirName) : toPascalCase(fileName);
    }

    case 'filename':
      return toPascalCase(fileName);

    case 'parent-directory': {
      // For guides, use the most specific directory (parent of file)
      const dirName = parts[parts.length - 2];
      if (dirName && dirName !== fileName && !dirName.includes('.')) {
        return toPascalCase(dirName);
      }
      // Try one level up if parent is same as filename
      if (parts.length >= 3) {
        const parentDir = parts[parts.length - 3];
        if (parentDir && parentDir !== fileName && !parentDir.includes('.')) {
          return toPascalCase(parentDir);
        }
      }
      return toPascalCase(fileName);
    }

    case 'last-segment': {
      // For foundations, use the last path segment before filename
      const foundationIndex = normalizedPath.indexOf('foundations-and-styles/');
      if (foundationIndex >= 0) {
        const afterFoundation = normalizedPath.slice(foundationIndex + 'foundations-and-styles/'.length);
        const segments = afterFoundation.split('/');
        const lastSegment = segments[segments.length - 1] || fileName;
        return toPascalCase(lastSegment.replace('.md', ''));
      }
      return toPascalCase(fileName);
    }

    default:
      return toPascalCase(fileName);
  }
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
 * Determine doc type from path using pattern matching
 */
function determineDocType(path: string): DocType {
  const normalizedPath = path.replace(/\\/g, '/');

  // Check patterns in order (accessibility before examples)
  for (const [docType, patterns] of Object.entries(DOC_TYPE_PATTERNS)) {
    if (patterns.some(pattern => normalizedPath.includes(pattern))) {
      return docType as DocType;
    }
  }

  // Default to design
  return 'design';
}

/**
 * Build GitHub raw URL using path utilities
 */
function buildGitHubUrl(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '');

  // Remove any CONTENT_BASE_PATH prefix if present
  const cleanPath = normalized.replace(new RegExp(`^${CONTENT_BASE_PATH}/?`), '');

  return `${GITHUB_RAW_BASE}/${CONTENT_BASE_PATH}/${cleanPath}`;
}

/**
 * Find all markdown files using fast-glob
 */
async function findMarkdownFiles(repoRoot: string): Promise<string[]> {
  try {
    const files = await fg(`${CONTENT_BASE_PATH}/**/*.md`, {
      cwd: repoRoot,
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/img/**',
        '**/.*/**',
        '**/.git/**'
      ]
    });

    return files;
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

  for (const entry of Object.values(index)) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  }

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
      console.log('🔄 Clone is older than 3 days, cleaning up and re-cloning...');
    }
    await cloneRepository(SOURCE);
  }

  const contentDir = join(SOURCE, CONTENT_BASE_PATH);

  if (!existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}\nPlease ensure patternfly-org is cloned to: ${SOURCE}`);
  }

  console.log(`Discovering markdown files in: ${CONTENT_BASE_PATH}`);
  const markdownFiles = await findMarkdownFiles(SOURCE);
  console.log(`Found ${markdownFiles.length} markdown files`);

  const index: DocsIndex = {};

  for (const filePath of markdownFiles) {
    // Calculate relative path from contentDir
    let relativePath = relative(contentDir, filePath).replace(/\\/g, '/').replace(/^\.\//, '');

    const typeInfo = parsePathToType(relativePath);
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
    const githubUrl = buildGitHubUrl(relativePath);
    versionDocs[docType] = githubUrl;

    // Update availability
    versionDocs.available = Boolean(versionDocs.design || versionDocs.accessibility || versionDocs.examples);
  }

  return index;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Generating PatternFly documentation index...');
    console.log(`Source: ${SOURCE}`);
    console.log(`Output: ${OUTPUT}`);

    const index = await generateIndex();
    const indexWithMetadata = createIndexWithMetadata(index);
    const jsonContent = JSON.stringify(indexWithMetadata, null, 2);

    await writeFile(OUTPUT, jsonContent, 'utf-8');

    // Set process.env.PF_DOCS_STATS for runtime access
    const metadata = {
      generatedAt: indexWithMetadata.generatedAt,
      packageVersion: indexWithMetadata.packageVersion,
      total: indexWithMetadata.total,
      byType: indexWithMetadata.byType
    };
    process.env.PF_DOCS_STATS = JSON.stringify(metadata);

    // Log stats
    console.log(`\n📊 Documentation Index Stats:`);
    console.log(`   Total entries: ${indexWithMetadata.total}`);
    console.log(`   Generated at: ${indexWithMetadata.generatedAt}`);
    console.log(`   Package version: ${indexWithMetadata.packageVersion}`);
    console.log(`   Entries by type:`);
    Object.entries(indexWithMetadata.byType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        console.log(`     ${type}: ${count}`);
      });

    console.log(`\n✅ Generated index with ${indexWithMetadata.total} entries`);
    console.log(`📄 Output written to: ${OUTPUT}`);
    console.log(`🔧 process.env.PF_DOCS_STATS set for runtime access`);
  } catch (error) {
    console.error('Error generating index:', error);
    process.exit(1);
  }
}

main();

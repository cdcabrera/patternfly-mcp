#!/usr/bin/env node
/**
 * Generate PatternFly documentation index JSON from patternfly-org repository
 *
 * This script:
 * 1. Discovers all markdown files in the patternfly-org repository
 * 2. Parses paths to determine component names, types, and categories
 * 3. Generates aliases automatically
 * 4. Creates version-specific documentation URLs
 * 5. Outputs a JSON index file with metadata for change detection
 *
 * Change Detection:
 * - Tracks total entry count and counts by type
 * - Compares with stored metadata
 * - Prompts update if changes exceed threshold (default: 5 entries)
 * - Ignores minor changes below threshold
 *
 * Usage:
 *   npm run build:resources
 *   npm run build:resources -- --source .agent/_resources/patternfly-org
 *   npm run build:resources -- --output src/docs.index.json
 *   npm run build:resources -- --clone  (force clone even if source exists)
 */

import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import diff from 'fast-diff';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types
type ContentType = 
  | 'component'
  | 'pattern'
  | 'foundation'
  | 'layout'
  | 'extension'
  | 'component-group'
  | 'chart'
  | 'topology'
  | 'accessibility'
  | 'content-design'
  | 'guide';

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
  category: string; // Path-based default, can be overridden
  aliases?: string[];
  deprecated?: boolean;
  docs: Record<string, VersionDocs>;
}

type DocsIndex = Record<string, ComponentDoc>;

// Configuration
const DEFAULT_SOURCE = join(__dirname, '../.agent/_resources/patternfly-org');
const DEFAULT_OUTPUT = join(__dirname, '../src/docs.index.json');
const DEFAULT_METADATA_OUTPUT = join(__dirname, '../src/docs.index.metadata.json');
const DEFAULT_VERSION = '6';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/patternfly/patternfly-org/main';
const GITHUB_REPO = 'https://github.com/patternfly/patternfly-org.git';
const CONTENT_BASE_PATH = 'packages/documentation-site/patternfly-docs/content';
const TEMP_DIR = process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp';
const CHANGE_THRESHOLD = 5; // Number of entries that must change to trigger update prompt

// Parse CLI arguments
const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const outputIndex = args.indexOf('--output');
const metadataOutputIndex = args.indexOf('--metadata-output');
const cloneIndex = args.indexOf('--clone');
const source = sourceIndex >= 0 && args[sourceIndex + 1] ? args[sourceIndex + 1] : DEFAULT_SOURCE;
const output = outputIndex >= 0 && args[outputIndex + 1] ? args[outputIndex + 1] : DEFAULT_OUTPUT;
const metadataOutput = metadataOutputIndex >= 0 && args[metadataOutputIndex + 1] ? args[metadataOutputIndex + 1] : DEFAULT_METADATA_OUTPUT;
const shouldClone = cloneIndex >= 0 || !existsSync(join(source, CONTENT_BASE_PATH));

/**
 * Parse path to determine type and category
 * Uses path-based defaults unless explicitly specified
 */
function parsePathToType(path: string): { type: ContentType; category: string; isAccessibility: boolean } | null {
  const normalizedPath = path.replace(/\\/g, '/');
  
  // Check if this is an accessibility doc (but still part of a component)
  const isAccessibility = normalizedPath.includes('/accessibility/');
  
  // Extract the top-level directory as the default category
  const parts = normalizedPath.split('/');
  const topLevelDir = parts.find(p => 
    p && 
    !p.startsWith('.') && 
    p !== 'packages' && 
    p !== 'documentation-site' && 
    p !== 'patternfly-docs' && 
    p !== 'content'
  );
  
  // Default category is the path segment (e.g., "components", "patterns")
  // This is the path-based default as requested
  let category = topLevelDir || 'unknown';
  
  // Determine type based on path patterns
  // Note: relativePath is relative to content/, so it's like "patterns/actions/actions.md"
  let type: ContentType;
  
  // Check for patterns (with or without leading slash)
  if (normalizedPath.includes('patterns/') || normalizedPath.startsWith('patterns/')) {
    type = 'pattern';
    category = 'pattern';
  } else if (normalizedPath.includes('components/') || normalizedPath.startsWith('components/')) {
    // Components (including accessibility subdirectory)
    type = 'component';
    category = 'component';
  } else if (normalizedPath.includes('foundations-and-styles/') || normalizedPath.startsWith('foundations-and-styles/')) {
    if (normalizedPath.includes('layouts/')) {
      type = 'layout';
      category = 'layout';
    } else {
      type = 'foundation';
      category = 'foundation';
    }
  } else if (normalizedPath.includes('extensions/') || normalizedPath.startsWith('extensions/')) {
    type = 'extension';
    category = 'extension';
  } else if (normalizedPath.includes('component-groups/') || normalizedPath.startsWith('component-groups/')) {
    type = 'component-group';
    category = 'component-group';
  } else if ((normalizedPath.includes('accessibility/') || normalizedPath.startsWith('accessibility/')) && !normalizedPath.includes('components/')) {
    // Standalone accessibility docs (not component-specific)
    type = 'accessibility';
    category = 'accessibility';
  } else if (normalizedPath.includes('content-design/') || normalizedPath.startsWith('content-design/')) {
    type = 'content-design';
    category = 'content-design';
  } else if (normalizedPath.includes('get-started/') || normalizedPath.startsWith('get-started/') || normalizedPath.includes('developer-guides/') || normalizedPath.startsWith('developer-guides/')) {
    type = 'guide';
    category = 'guide';
  } else if (normalizedPath.includes('AI/') || normalizedPath.startsWith('AI/')) {
    type = 'guide'; // AI docs as guides
    category = 'AI'; // Use path-based category
  } else {
    // Default: use path-based category
    type = 'component'; // Safe default
  }
  
  return { type, category, isAccessibility };
}

/**
 * Extract component name from path
 */
function extractComponentName(path: string, type: ContentType): string {
  const normalizedPath = path.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const fileName = basename(path, '.md');
  
  // For patterns, use directory name (check this FIRST before components)
  if (parts.includes('patterns')) {
    const patternIndex = parts.indexOf('patterns');
    if (patternIndex >= 0 && parts[patternIndex + 1]) {
      const dirName = parts[patternIndex + 1];
      return dirName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    }
  }
  
  // For layouts, use the file name (e.g., "bullseye.md" -> "Bullseye")
  if (parts.includes('layouts')) {
    return fileName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
  
  // For components (including accessibility subdirectory), use the directory name
  if (parts.includes('components')) {
    const componentIndex = parts.indexOf('components');
    if (componentIndex >= 0) {
      // Skip "accessibility" directory if present
      let dirIndex = componentIndex + 1;
      if (parts[dirIndex] === 'accessibility') {
        dirIndex++;
      }
      if (parts[dirIndex]) {
        const dirName = parts[dirIndex];
        // Convert kebab-case to PascalCase
        return dirName
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');
      }
    }
  }
  
  // For foundations, use file/directory name
  if (type === 'foundation') {
    const foundationParts = normalizedPath.split('/foundations-and-styles/')[1]?.split('/') || [];
    const namePart = foundationParts[foundationParts.length - 1] || fileName;
    return namePart
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
  
  // For other types, use directory name if available, otherwise file name
  const dirName = parts[parts.length - 2]; // Parent directory
  if (dirName && dirName !== fileName && !dirName.includes('.')) {
    return dirName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
  
  // Default: use file name
  return fileName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Generate aliases for a component name
 */
function generateAliases(componentName: string, type: ContentType): string[] {
  const aliases: string[] = [];
  
  // Lowercase version
  aliases.push(componentName.toLowerCase());
  
  // Hyphenated version (PascalCase -> kebab-case)
  const hyphenated = componentName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
  if (hyphenated !== componentName.toLowerCase()) {
    aliases.push(hyphenated);
  }
  
  // Common abbreviations
  const abbrevMap: Record<string, string[]> = {
    'Button': ['btn'],
    'Table': ['tbl', 'data-table', 'datatable', 'grid-table'],
    'Accordion': ['accordian'], // Common misspelling
    'SearchInput': ['search', 'search-input'],
    'TextInput': ['text', 'input', 'text-input'],
    'DataList': ['datalist', 'list'],
    'FormSelect': ['select', 'dropdown-select'],
    'ApplicationLauncher': ['app-launcher', 'launcher'],
    'NotificationDrawer': ['notification', 'drawer'],
    'Page': ['page-layout'],
    'Masthead': ['header', 'topbar'],
    'Sidebar': ['nav', 'navigation'],
  };
  
  if (abbrevMap[componentName]) {
    aliases.push(...abbrevMap[componentName]);
  }
  
  return [...new Set(aliases)]; // Deduplicate
}

/**
 * Determine doc type from path
 */
function determineDocType(path: string): DocType | null {
  const normalizedPath = path.replace(/\\/g, '/');
  
  if (normalizedPath.includes('/accessibility/')) {
    return 'accessibility';
  }
  if (normalizedPath.includes('/examples/')) {
    return 'examples';
  }
  // Default to design
  return 'design';
}

/**
 * Build GitHub raw URL for a file
 */
function buildGitHubUrl(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  // The relativePath is already relative to contentDir, so it's the path within content/
  // We just need to ensure it's clean
  const cleanPath = normalized
    .replace(/^\.\//, '')
    .replace(/^packages\/documentation-site\/patternfly-docs\/content\//, '');
  
  return `${GITHUB_RAW_BASE}/${CONTENT_BASE_PATH}/${cleanPath}`;
}

/**
 * Recursively find all markdown files
 */
async function findMarkdownFiles(dir: string, baseDir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      // Skip node_modules, .git, etc.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await findMarkdownFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip files in img directories
        if (!fullPath.includes('/img/')) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dir}: ${error}`);
  }
  
  return files;
}

/**
 * Clone patternfly-org repository to a temporary directory
 */
async function cloneRepository(targetDir: string): Promise<void> {
  console.log(`Cloning patternfly-org repository to: ${targetDir}`);
  
  // Remove existing directory if it exists
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  
  // Create parent directory if needed
  const parentDir = dirname(targetDir);
  if (!existsSync(parentDir)) {
    await mkdir(parentDir, { recursive: true });
  }
  
  try {
    // Shallow clone (depth=1) for faster cloning
    execSync(
      `git clone --depth 1 --branch main ${GITHUB_REPO} "${targetDir}"`,
      { stdio: 'inherit' }
    );
    console.log('✅ Repository cloned successfully');
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error}`);
  }
}

/**
 * Metadata about the documentation index
 */
interface IndexMetadata {
  totalEntries: number;
  entriesByType: Record<string, number>;
  generatedAt: string;
}

/**
 * Calculate metadata from the generated index
 */
function calculateIndexMetadata(index: DocsIndex): IndexMetadata {
  const entriesByType: Record<string, number> = {};
  
  for (const entry of Object.values(index)) {
    entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
  }
  
  return {
    totalEntries: Object.keys(index).length,
    entriesByType,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Diff result for component changes
 */
interface ComponentDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

/**
 * Compare two indexes using fast-diff (Myers algorithm)
 * Returns which components were added, removed, or potentially modified
 */
function diffIndexes(
  storedIndex: DocsIndex | null,
  currentIndex: DocsIndex
): ComponentDiff {
  if (!storedIndex || typeof storedIndex !== 'object') {
    return {
      added: Object.keys(currentIndex || {}),
      removed: [],
      modified: []
    };
  }
  
  // Convert object keys to sorted arrays for diffing
  // Sorting ensures consistent comparison order
  const storedKeys = Object.keys(storedIndex).sort();
  const currentKeys = Object.keys(currentIndex || {}).sort();
  
  // Use fast-diff to compare the key arrays
  // Join keys with newlines to create strings for diffing
  const storedKeysStr = storedKeys.join('\n');
  const currentKeysStr = currentKeys.join('\n');
  
  const diffResult = diff(storedKeysStr, currentKeysStr);
  
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  
  // Process diff results
  // fast-diff returns: [[operation, text], ...]
  // operation: -1 = DELETE, 0 = EQUAL, 1 = INSERT
  // Reconstruct the strings from diff to extract added/removed keys
  let storedReconstructed = '';
  let currentReconstructed = '';
  
  for (const [operation, text] of diffResult) {
    if (operation === diff.DELETE) {
      storedReconstructed += text;
    } else if (operation === diff.INSERT) {
      currentReconstructed += text;
    } else if (operation === diff.EQUAL) {
      storedReconstructed += text;
      currentReconstructed += text;
    }
  }
  
  // Extract keys from reconstructed strings
  const storedKeysFromDiff = new Set(storedReconstructed.split('\n').filter(k => k.length > 0));
  const currentKeysFromDiff = new Set(currentReconstructed.split('\n').filter(k => k.length > 0));
  
  // Find added and removed components
  const storedKeysSet = new Set(storedKeys);
  const currentKeysSet = new Set(currentKeys);
  
  for (const key of currentKeysSet) {
    if (!storedKeysSet.has(key)) {
      added.push(key);
    }
  }
  
  for (const key of storedKeysSet) {
    if (!currentKeysSet.has(key)) {
      removed.push(key);
    }
  }
  
  // Find potentially modified components (exist in both, but content might differ)
  for (const key of storedKeysSet) {
    if (currentKeysSet.has(key)) {
      const storedEntry = storedIndex[key];
      const currentEntry = currentIndex[key];
      
      // Compare a signature of the entry (type + available docs)
      const storedSig = `${storedEntry.type}:${storedEntry.docs['6']?.available || false}`;
      const currentSig = `${currentEntry.type}:${currentEntry.docs['6']?.available || false}`;
      
      if (storedSig !== currentSig) {
        modified.push(key);
      }
    }
  }
  
  return { added, removed, modified };
}

/**
 * Compare metadata and determine if significant changes occurred
 * Uses diff to show exactly what changed
 */
function compareMetadata(
  stored: IndexMetadata | null,
  current: IndexMetadata,
  storedIndex: DocsIndex | null,
  currentIndex: DocsIndex
): { hasSignificantChanges: boolean; differences: string[]; componentDiff: ComponentDiff } {
  const differences: string[] = [];
  const componentDiff = diffIndexes(storedIndex, currentIndex);
  
  if (!stored) {
    return { 
      hasSignificantChanges: true, 
      differences: ['No stored metadata found'], 
      componentDiff 
    };
  }
  
  // Check total entries
  const totalDiff = Math.abs(current.totalEntries - stored.totalEntries);
  if (totalDiff > 0) {
    differences.push(`Total entries: ${stored.totalEntries} → ${current.totalEntries} (${totalDiff > 0 ? '+' : ''}${totalDiff})`);
  }
  
  // Check entries by type
  const allTypes = new Set([...Object.keys(stored.entriesByType), ...Object.keys(current.entriesByType)]);
  let totalTypeDiff = 0;
  
  for (const type of allTypes) {
    const storedCount = stored.entriesByType[type] || 0;
    const currentCount = current.entriesByType[type] || 0;
    const diff = Math.abs(currentCount - storedCount);
    
    if (diff > 0) {
      totalTypeDiff += diff;
      differences.push(`${type}: ${storedCount} → ${currentCount} (${currentCount > storedCount ? '+' : ''}${currentCount - storedCount})`);
    }
  }
  
  // Add component-level diff details
  if (componentDiff.added.length > 0) {
    differences.push(`\nAdded components (${componentDiff.added.length}):`);
    componentDiff.added.slice(0, 10).forEach(comp => {
      const entry = currentIndex[comp];
      differences.push(`  + ${comp} (${entry.type})`);
    });
    if (componentDiff.added.length > 10) {
      differences.push(`  ... and ${componentDiff.added.length - 10} more`);
    }
  }
  
  if (componentDiff.removed.length > 0) {
    differences.push(`\nRemoved components (${componentDiff.removed.length}):`);
    componentDiff.removed.slice(0, 10).forEach(comp => {
      differences.push(`  - ${comp}`);
    });
    if (componentDiff.removed.length > 10) {
      differences.push(`  ... and ${componentDiff.removed.length - 10} more`);
    }
  }
  
  if (componentDiff.modified.length > 0) {
    differences.push(`\nModified components (${componentDiff.modified.length}):`);
    componentDiff.modified.slice(0, 10).forEach(comp => {
      differences.push(`  ~ ${comp}`);
    });
    if (componentDiff.modified.length > 10) {
      differences.push(`  ... and ${componentDiff.modified.length - 10} more`);
    }
  }
  
  // Significant if total difference exceeds threshold
  // Count actual component changes (added + removed) for threshold
  const componentChangeCount = componentDiff.added.length + componentDiff.removed.length;
  const hasSignificantChanges = totalDiff >= CHANGE_THRESHOLD || 
                                totalTypeDiff >= CHANGE_THRESHOLD || 
                                componentChangeCount >= CHANGE_THRESHOLD;
  
  return { hasSignificantChanges, differences, componentDiff };
}

/**
 * Generate the documentation index
 */
async function generateIndex(): Promise<DocsIndex> {
  let actualSource = source;
  
  // Clone repository if needed
  if (shouldClone) {
    // Use temp directory in CI, or local .agent/_resources otherwise
    const cloneTarget = process.env.CI 
      ? join(TEMP_DIR, 'patternfly-org')
      : source;
    
    await cloneRepository(cloneTarget);
    actualSource = cloneTarget;
  } else {
    // Use provided source if it exists
    actualSource = source;
  }
  
  const contentDir = join(actualSource, CONTENT_BASE_PATH);
  
  if (!existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}\nPlease ensure patternfly-org is cloned to: ${actualSource}`);
  }
  
  console.log(`Discovering markdown files in: ${contentDir}`);
  const markdownFiles = await findMarkdownFiles(contentDir, contentDir);
  console.log(`Found ${markdownFiles.length} markdown files`);
  
  const index: DocsIndex = {};
  
  for (const filePath of markdownFiles) {
    const relativePath = relative(contentDir, filePath);
    const typeInfo = parsePathToType(relativePath);
    
    if (!typeInfo) {
      console.warn(`Skipping file (could not determine type): ${relativePath}`);
      continue;
    }
    
    const { type, category, isAccessibility } = typeInfo;
    const componentName = extractComponentName(relativePath, type);
    const docType = determineDocType(relativePath);
    
    if (!docType) {
      continue;
    }
    
    // Get or create component entry
    // If it's an accessibility doc for a component, merge into existing entry
    if (!index[componentName]) {
      index[componentName] = {
        component: componentName,
        type,
        category,
        aliases: generateAliases(componentName, type),
        deprecated: false,
        docs: {}
      };
    } else {
      // If entry exists, preserve the original type unless we're upgrading from accessibility to component
      // This handles the case where accessibility file is processed before design file
      const existingEntry = index[componentName];
      
      // If existing is accessibility but we're processing a component doc, upgrade it
      if (existingEntry.type === 'accessibility' && type === 'component') {
        existingEntry.type = type;
        existingEntry.category = category;
      }
      // If existing is component and we're processing accessibility, keep component type
      // (type is already correct, no change needed)
    }
    
    // Ensure version entry exists
    if (!index[componentName].docs[DEFAULT_VERSION]) {
      index[componentName].docs[DEFAULT_VERSION] = {
        design: null,
        accessibility: null,
        examples: null,
        available: false
      };
    }
    
    // Set the URL for this doc type
    const githubUrl = buildGitHubUrl(relativePath);
    const versionDocs = index[componentName].docs[DEFAULT_VERSION];
    
    if (docType === 'design') {
      versionDocs.design = githubUrl;
    } else if (docType === 'accessibility') {
      versionDocs.accessibility = githubUrl;
    } else if (docType === 'examples') {
      versionDocs.examples = githubUrl;
    }
    
    // Update availability (true if at least one doc exists)
    versionDocs.available = !!(
      versionDocs.design || 
      versionDocs.accessibility || 
      versionDocs.examples
    );
  }
  
  return index;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Generating PatternFly documentation index...');
    console.log(`Source: ${source}`);
    console.log(`Output: ${output}`);
    console.log(`Metadata output: ${metadataOutput}`);
    if (shouldClone) {
      console.log('🔄 Will clone repository if needed');
    }
    
    const index = await generateIndex();
    
    // Load stored index and metadata BEFORE writing new ones (for comparison)
    let storedMetadata: IndexMetadata | null = null;
    let storedIndex: DocsIndex | null = null;
    
    if (existsSync(metadataOutput)) {
      try {
        const storedContent = await readFile(metadataOutput, 'utf-8');
        storedMetadata = JSON.parse(storedContent);
      } catch (error) {
        console.warn(`Warning: Could not parse stored metadata: ${error}`);
      }
    }
    
    // Load stored index for diff comparison
    if (existsSync(output)) {
      try {
        const storedIndexContent = await readFile(output, 'utf-8');
        storedIndex = JSON.parse(storedIndexContent);
      } catch (error) {
        // If we can't read stored index, that's okay - we'll just show metadata diff
        console.warn(`Warning: Could not parse stored index for diff: ${error}`);
      }
    }
    
    // Write JSON file
    const jsonContent = JSON.stringify(index, null, 2);
    await writeFile(output, jsonContent, 'utf-8');
    
    // Calculate and write metadata
    const currentMetadata = calculateIndexMetadata(index);
    
    const comparison = compareMetadata(storedMetadata, currentMetadata, storedIndex, index);
    
    const changeCount = comparison.componentDiff.added.length + comparison.componentDiff.removed.length;
    
    if (comparison.hasSignificantChanges && storedMetadata) {
      console.log(`\n⚠️  Significant content changes detected (threshold: ${CHANGE_THRESHOLD} entries):`);
      console.log(`   Component changes: ${changeCount} (${comparison.componentDiff.added.length} added, ${comparison.componentDiff.removed.length} removed)`);
      console.log(``);
      comparison.differences.forEach(diff => {
        console.log(diff);
      });
      console.log(`\n   This indicates PatternFly documentation has been updated.`);
      console.log(`   Review changes and commit the updated files:`);
      console.log(`     git add ${output} ${metadataOutput}`);
      console.log(`     git commit -m "chore: update docs index from patternfly-org"`);
    } else if (comparison.hasSignificantChanges) {
      console.log(`\n📝 Initial metadata generated`);
    } else if (storedMetadata && comparison.differences.length > 0) {
      console.log(`\nℹ️  Minor changes detected (below threshold of ${CHANGE_THRESHOLD}):`);
      if (changeCount > 0) {
        console.log(`   Component changes: ${changeCount} (${comparison.componentDiff.added.length} added, ${comparison.componentDiff.removed.length} removed)`);
      }
      comparison.differences.forEach(diff => {
        if (!diff.startsWith('\n') && !diff.startsWith('  ')) {
          console.log(`   ${diff}`);
        } else {
          console.log(diff);
        }
      });
    }
    
    await writeFile(metadataOutput, JSON.stringify(currentMetadata, null, 2), 'utf-8');
    
    console.log(`\n✅ Generated index with ${currentMetadata.totalEntries} entries`);
    console.log(`📄 Output written to: ${output}`);
    console.log(`📊 Metadata written to: ${metadataOutput}`);
    console.log(`   Entries by type:`);
    Object.entries(currentMetadata.entriesByType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        console.log(`     ${type}: ${count}`);
      });
    
    // Print summary
    const byType = Object.values(index).reduce((acc, entry) => {
      acc[entry.type] = (acc[entry.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\nSummary by type:');
    Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    
  } catch (error) {
    console.error('Error generating index:', error);
    process.exit(1);
  }
}

main();


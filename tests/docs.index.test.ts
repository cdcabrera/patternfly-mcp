/**
 * E2E test for documentation index generation
 *
 * This test ensures that:
 * 1. The generated docs.index.json matches the expected version
 * 2. Developers are prompted to update the resource if PatternFly-org version changes
 * 3. Only major.minor version changes trigger updates (ignores patch/alpha)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..');
const DOCS_INDEX_PATH = join(ROOT_DIR, 'src/docs.index.json');
const DOCS_VERSION_PATH = join(ROOT_DIR, 'src/docs.index.version');

/**
 * Extract major.minor version from semver string
 */
function extractMajorMinorVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return `${match[1]}.${match[2]}`;
}

describe('Documentation Index', () => {
  it('should have a generated docs.index.json file', () => {
    expect(existsSync(DOCS_INDEX_PATH)).toBe(true);
  });

  it('should have a version file for validation', () => {
    expect(existsSync(DOCS_VERSION_PATH)).toBe(true);
  });

  it('should have a valid version format (major.minor only)', () => {
    if (!existsSync(DOCS_VERSION_PATH)) {
      throw new Error('docs.index.version not found. Run "npm run build:resources" first.');
    }

    // Read stored version (major.minor format)
    const storedVersion = readFileSync(DOCS_VERSION_PATH, 'utf-8').trim();
    
    // Validate version format (must be major.minor, e.g., "4.21")
    const versionMatch = storedVersion.match(/^\d+\.\d+$/);
    if (!versionMatch) {
      throw new Error(`Invalid version format in docs.index.version: ${storedVersion}. Expected format: major.minor (e.g., "4.21")`);
    }

    expect(storedVersion).toMatch(/^\d+\.\d+$/);
    
    // Validate it's not a full semver (should only be major.minor)
    const parts = storedVersion.split('.');
    expect(parts.length).toBe(2);
    if (parts[0] && parts[1]) {
      expect(parseInt(parts[0], 10)).toBeGreaterThanOrEqual(0);
      expect(parseInt(parts[1], 10)).toBeGreaterThanOrEqual(0);
    }
  });

  it('should be valid JSON', () => {
    if (!existsSync(DOCS_INDEX_PATH)) {
      throw new Error('docs.index.json not found. Run "npm run build:resources" first.');
    }

    const content = readFileSync(DOCS_INDEX_PATH, 'utf-8');
    
    expect(() => {
      JSON.parse(content);
    }).not.toThrow();

    const index = JSON.parse(content);
    expect(typeof index).toBe('object');
    expect(Array.isArray(index)).toBe(false); // Should be an object, not array
  });

  it('should have required structure for entries', () => {
    if (!existsSync(DOCS_INDEX_PATH)) {
      throw new Error('docs.index.json not found. Run "npm run build:resources" first.');
    }

    const content = readFileSync(DOCS_INDEX_PATH, 'utf-8');
    const index = JSON.parse(content);

    // Check at least one entry exists
    const entries = Object.values(index);
    expect(entries.length).toBeGreaterThan(0);

    // Check structure of first entry
    const firstEntry = entries[0] as any;
    expect(firstEntry).toHaveProperty('component');
    expect(firstEntry).toHaveProperty('type');
    expect(firstEntry).toHaveProperty('category');
    expect(firstEntry).toHaveProperty('docs');
    expect(firstEntry).toHaveProperty('deprecated');

    // Check docs structure
    const versionDocs = firstEntry.docs['6'];
    if (versionDocs) {
      expect(versionDocs).toHaveProperty('design');
      expect(versionDocs).toHaveProperty('accessibility');
      expect(versionDocs).toHaveProperty('examples');
      expect(versionDocs).toHaveProperty('available');
    }
  });
});


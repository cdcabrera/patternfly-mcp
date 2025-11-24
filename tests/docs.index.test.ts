/**
 * E2E test for documentation index generation
 *
 * This test ensures that:
 * 1. The generated docs.index.json matches the expected hash
 * 2. Developers are prompted to update the resource if it changes
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..');
const DOCS_INDEX_PATH = join(ROOT_DIR, 'src/docs.index.json');
const DOCS_HASH_PATH = join(ROOT_DIR, 'src/docs.index.json.hash');

/**
 * Calculate SHA-256 hash of file content
 */
function calculateFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

describe('Documentation Index', () => {
  it('should have a generated docs.index.json file', () => {
    expect(existsSync(DOCS_INDEX_PATH)).toBe(true);
  });

  it('should have a hash file for validation', () => {
    expect(existsSync(DOCS_HASH_PATH)).toBe(true);
  });

  it('should match the expected hash (prompts update if changed)', () => {
    if (!existsSync(DOCS_INDEX_PATH)) {
      throw new Error('docs.index.json not found. Run "npm run build:resources" first.');
    }

    if (!existsSync(DOCS_HASH_PATH)) {
      throw new Error('docs.index.json.hash not found. Run "npm run build:resources" first.');
    }

    const currentHash = calculateFileHash(DOCS_INDEX_PATH);
    const expectedHash = readFileSync(DOCS_HASH_PATH, 'utf-8').trim();

    if (currentHash !== expectedHash) {
      const errorMessage = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  DOCUMENTATION INDEX HAS CHANGED                                             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  The generated docs.index.json does not match the expected hash.            ║
║  This usually means the PatternFly documentation has been updated.           ║
║                                                                              ║
║  Expected hash: ${expectedHash}                                             ║
║  Current hash:  ${currentHash}                                             ║
║                                                                              ║
║  To update:                                                                  ║
║    1. Run: npm run build:resources                                          ║
║    2. Review the changes in src/docs.index.json                              ║
║    3. Commit the updated files:                                             ║
║       git add src/docs.index.json src/docs.index.json.hash                  ║
║       git commit -m "chore: update docs index from patternfly-org"           ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
      `;

      throw new Error(errorMessage);
    }

    expect(currentHash).toBe(expectedHash);
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


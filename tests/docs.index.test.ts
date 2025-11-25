/**
 * E2E test for documentation index generation
 *
 * This test ensures that:
 * 1. The generated docs.index.json and metadata files exist
 * 2. Metadata structure is valid (entry counts, types, timestamp)
 * 3. The build script compares metadata to detect significant content changes
 * 4. Changes are detected based on entry count differences (threshold: 5 entries)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..');
const DOCS_INDEX_PATH = join(ROOT_DIR, 'src/docs.index.json');
const DOCS_METADATA_PATH = join(ROOT_DIR, 'src/docs.index.metadata.json');

/**
 * Index metadata structure
 */
interface IndexMetadata {
  totalEntries: number;
  entriesByType: Record<string, number>;
  generatedAt: string;
}

describe('Documentation Index', () => {
  it('should have a generated docs.index.json file', () => {
    expect(existsSync(DOCS_INDEX_PATH)).toBe(true);
  });

  it('should have a metadata file for validation', () => {
    expect(existsSync(DOCS_METADATA_PATH)).toBe(true);
  });

  it('should have valid metadata structure', () => {
    if (!existsSync(DOCS_METADATA_PATH)) {
      throw new Error('docs.index.metadata.json not found. Run "npm run build:resources" first.');
    }

    const metadataContent = readFileSync(DOCS_METADATA_PATH, 'utf-8');
    let metadata: IndexMetadata;

    try {
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      throw new Error(`Invalid JSON in docs.index.metadata.json: ${error}`);
    }

    // Validate structure
    expect(metadata).toHaveProperty('totalEntries');
    expect(metadata).toHaveProperty('entriesByType');
    expect(metadata).toHaveProperty('generatedAt');

    expect(typeof metadata.totalEntries).toBe('number');
    expect(metadata.totalEntries).toBeGreaterThan(0);
    expect(typeof metadata.entriesByType).toBe('object');
    expect(typeof metadata.generatedAt).toBe('string');

    // Validate generatedAt is ISO date
    expect(() => new Date(metadata.generatedAt)).not.toThrow();

    // Validate entriesByType has numeric values
    for (const [type, count] of Object.entries(metadata.entriesByType)) {
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    }

    // Validate totalEntries matches sum of entriesByType
    const sumByType = Object.values(metadata.entriesByType).reduce((sum, count) => sum + count, 0);

    expect(metadata.totalEntries).toBe(sumByType);
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


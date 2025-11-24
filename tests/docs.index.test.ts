/**
 * E2E test for documentation index generation
 *
 * This test ensures that:
 * 1. The generated docs.index.json file exists with combined metadata
 * 2. Metadata structure is valid (entry counts, types, timestamp, package version)
 * 3. Documents structure is valid
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const DOCS_INDEX_PATH = join(ROOT_DIR, 'src/docs.index.json');

/**
 * Combined index structure with metadata
 */
interface DocsIndexWithMetadata {
  generatedAt: string;
  packageVersion: string;
  total: number;
  byType: Record<string, number>;
  documents: Record<string, any>;
}

describe('Documentation Index', () => {
  it('should have a generated docs.index.json file', () => {
    expect(existsSync(DOCS_INDEX_PATH)).toBe(true);
  });

  it('should have valid combined structure with metadata', () => {
    if (!existsSync(DOCS_INDEX_PATH)) {
      throw new Error('docs.index.json not found. Run "npm run build:resources" first.');
    }

    const content = readFileSync(DOCS_INDEX_PATH, 'utf-8');
    let indexWithMetadata: DocsIndexWithMetadata;

    try {
      indexWithMetadata = JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in docs.index.json: ${error}`);
    }

    // Validate metadata structure
    expect(indexWithMetadata).toHaveProperty('generatedAt');
    expect(indexWithMetadata).toHaveProperty('packageVersion');
    expect(indexWithMetadata).toHaveProperty('total');
    expect(indexWithMetadata).toHaveProperty('byType');
    expect(indexWithMetadata).toHaveProperty('documents');

    expect(typeof indexWithMetadata.generatedAt).toBe('string');
    expect(typeof indexWithMetadata.packageVersion).toBe('string');
    expect(typeof indexWithMetadata.total).toBe('number');
    expect(indexWithMetadata.total).toBeGreaterThan(0);
    expect(typeof indexWithMetadata.byType).toBe('object');
    expect(typeof indexWithMetadata.documents).toBe('object');

    // Validate generatedAt is ISO date
    expect(() => new Date(indexWithMetadata.generatedAt)).not.toThrow();

    // Validate byType has numeric values
    for (const [_type, count] of Object.entries(indexWithMetadata.byType)) {
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    }

    // Validate total matches sum of byType
    const sumByType = Object.values(indexWithMetadata.byType).reduce((sum, count) => sum + count, 0);

    expect(indexWithMetadata.total).toBe(sumByType);

    // Validate total matches number of documents
    const documentCount = Object.keys(indexWithMetadata.documents).length;

    expect(indexWithMetadata.total).toBe(documentCount);
  });

  it('should have required structure for document entries', () => {
    if (!existsSync(DOCS_INDEX_PATH)) {
      throw new Error('docs.index.json not found. Run "npm run build:resources" first.');
    }

    const content = readFileSync(DOCS_INDEX_PATH, 'utf-8');
    const indexWithMetadata = JSON.parse(content) as DocsIndexWithMetadata;

    // Check documents exist
    expect(indexWithMetadata.documents).toBeDefined();
    const documents = indexWithMetadata.documents;

    // Check at least one entry exists
    const entries = Object.values(documents);

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


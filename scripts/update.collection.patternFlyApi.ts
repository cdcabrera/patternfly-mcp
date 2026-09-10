import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiSpider,
  contentMetadata,
  type ApiCrawler,
  type ApiEmbedded,
  type ApiEmbeddedCollection
} from '../src/collection.patternFlyApi';
import { getOptions, runWithOptions } from '../src/options.context';

/**
 * Run apiSpider directly and transform crawler entries into compressed embedded JSON.
 *
 * @param [options] - Optional configuration options.
 * @param [options.isPrettyPrint=true] - Whether to pretty-print the JSON output.
 * @param [options.filterLowQualityRecords=false] - Whether to filter low-quality records based on the collection's criteria.
 */
const run = async (
  { isPrettyPrint = true, filterLowQualityRecords = false }: { isPrettyPrint?: boolean; filterLowQualityRecords?: boolean } = {}
) => {
  console.log('🚀 Generating PatternFly API embedded collection...');
  const keepAlive = setTimeout(() => {}, 86_400_000);

  const startTime = Date.now();
  const options = getOptions();
  const { base } = options.patternflyOptions.api;

  try {
    const entries: ApiCrawler[] = await runWithOptions(options, async () => apiSpider(options));

    if (!entries.length) {
      console.error('❌ Crawl failed or returned 0 entries. Aborting update.');
      process.exit(1);
    }

    const recordsMap = new Map<string, ApiEmbedded>();

    for (const entry of entries) {
      // Generate full metadata using the shared contentMetadata function
      const metadata = contentMetadata(entry, options);

      if (filterLowQualityRecords && (metadata.isDeferred || metadata.isLowQuality)) {
        continue;
      }

      const relativePath = metadata.path.replace(base, '').replace(/^\//, '');

      if (recordsMap.has(relativePath)) {
        continue;
      }

      recordsMap.set(relativePath, {
        p: relativePath,
        n: metadata.displayName,
        d: metadata.description,
        c: metadata.contentType,
        q: entry.qualityScore
      });
    }

    const records = [...recordsMap.values()].sort((a, b) => a.p.localeCompare(b.p));

    const payload: ApiEmbeddedCollection = {
      version: '1',
      generated: new Date().toISOString(),
      base,
      records
    };

    const outputPath = resolve(fileURLToPath(new URL('../src/collection.patternFlyApi.json', import.meta.url)));
    const jsonContent = isPrettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
    await writeFile(outputPath, jsonContent + '\n', 'utf-8');

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);

    console.log(`✅ Updated src/collection.patternFlyApi.json:`);
    console.log(`   - Total Crawled: ${entries.length} endpoints`);
    console.log(`   - Admitted Records: ${records.length}`);
    console.log(`   - File Size: ${sizeKb} KB`);
    console.log(`   - Time Elapsed: ${durationSec}s`);
  } finally {
    clearTimeout(keepAlive);
  }
};

/**
 * Configurable options for maintainers.
 */
run({ isPrettyPrint: false, filterLowQualityRecords: true }).catch(error => {
  console.error('❌ Failed to update API collection:', error);
  process.exit(1);
});

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectionCallback, type ApiEmbeddedCollection } from '../src/collection.patternFlyApi';
import { getOptions } from '../src/options.context';

/**
 * Run collection.patternFlyApi to update the related embedded JSON.
 */
const run = async () => {
  console.log('🚀 Running PatternFly API collection crawl via collectionCallback()...');
  const startTime = Date.now();
  const options = getOptions();
  const { base } = options.patternflyOptions.api;

  const result = await collectionCallback();

  if (!result.records.length) {
    console.error('❌ Crawl failed or health probe rejected. Aborting update.');
    process.exit(1);
  }

  // Transform already-parsed collection records into compact { p, n, d, c, q } in 5 lines
  const records = result.records.map(record => {
    const [data = {}] = record.data ? Object.values(record.data)[0] : [];

    return {
      p: data.path?.replace(base, '')?.replace(/^\//, ''),
      n: data.displayName,
      d: data.description,
      c: data.contentType,
      q: 1.0
    };
  }).sort((a, b) => a.p.localeCompare(b.p));

  const payload: ApiEmbeddedCollection = {
    version: '1',
    generated: new Date().toISOString(),
    base,
    records
  };

  const outputPath = resolve(fileURLToPath(new URL('../src/collection.patternFlyApi.json', import.meta.url)));
  const jsonContent = JSON.stringify(payload, null, 2);
  await writeFile(outputPath, jsonContent, 'utf-8');

  console.log(`✅ Updated src/collection.patternFlyApi.json with ${records.length} records in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
};

run().catch(console.error);

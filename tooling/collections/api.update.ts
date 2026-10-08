import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  apiSpider,
  contentMetadata,
  type ApiContent,
  type ApiCrawler,
  type ApiEmbedded,
  type ApiEmbeddedCollection
} from '../../src/collection.patternFlyApi';
import { getSessionOptions, getOptions, runWithOptions } from '../../src/options.context';
import { createLogger } from '../../src/logger';
import { type LoggingSession } from '../../src/options.defaults';
import { resolveFromRoot } from './collections.helpers';
import {
  diffCollections,
  diffReport,
  escapeCsvField,
  formatCsv,
  generateReportCsv,
  type ModifiedRecordReport,
  type RemovalReason,
  type RemovedRecordReport
} from './api.helpers';

/**
 * Options for running the PatternFly API embedded collection generator.
 */
interface UpdateApiCollectionOptions {
  isPrettyPrint?: boolean;
  filterLowQualityRecords?: boolean;
  outputCsv?: boolean;
  csvOutputPath?: string;
  outputPath?: string;
}

/**
 * Run apiSpider directly and transform crawler entries into compressed embedded JSON.
 *
 * @param [options] - Optional configuration options
 * @param [options.isPrettyPrint=true] - Whether to pretty-print the JSON output
 * @param [options.filterLowQualityRecords=false] - Whether to filter low-quality records based on criteria
 * @param [options.outputCsv=true] - Whether to generate and save a full CSV diff report
 * @param [options.csvOutputPath] - Custom path to write CSV report
 * @param [options.outputPath] - Custom path to write collection JSON
 */
const run = async ({
  isPrettyPrint = true,
  filterLowQualityRecords = false,
  outputCsv = true,
  csvOutputPath,
  outputPath
}: UpdateApiCollectionOptions = {}) => {
  // 1. Enable stderr logging so all diagnostics_channel logs (debug, info, warn, error) are printed
  const unsubscribeLogger = createLogger({
    channelName: getSessionOptions().channelName,
    stderr: true,
    level: 'debug'
  } as LoggingSession);

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
    const crawledMap = new Map<string, { entry: ApiCrawler; metadata: ApiContent }>();

    for (const entry of entries) {
      // Generate full metadata using the shared contentMetadata function
      const metadata = contentMetadata(entry, options);
      const relativePath = metadata.path.replace(base, '').replace(/^\//, '');

      crawledMap.set(relativePath, { entry, metadata });

      if (filterLowQualityRecords && (metadata.isDeferred || metadata.isLowQuality)) {
        continue;
      }

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

    const targetOutputPath = outputPath || resolveFromRoot('src/collection.patternFlyApi.json');
    const jsonContent = isPrettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
    let oldRecords: ApiEmbedded[] = [];

    try {
      const existingContent = await readFile(targetOutputPath, 'utf-8');
      const parsedExisting: ApiEmbeddedCollection = JSON.parse(existingContent);

      oldRecords = parsedExisting.records || [];
    } catch {
      // File might not exist yet on initial run
    }

    await writeFile(targetOutputPath, jsonContent + '\n', 'utf-8');

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);

    console.log(`✅ Updated ${targetOutputPath}:`);
    console.log(`   - Total Crawled: ${entries.length} endpoints`);
    console.log(`   - Admitted Records: ${records.length}`);
    console.log(`   - File Size: ${sizeKb} KB`);
    console.log(`   - Time Elapsed: ${durationSec}s`);

    const diff = diffCollections(oldRecords, records, crawledMap);

    diffReport(diff);

    if (outputCsv) {
      const targetCsvPath =
        csvOutputPath ||
        process.env.CSV_REPORT_PATH ||
        resolveFromRoot('reports/collection.patternFlyApi.report.csv');

      await mkdir(dirname(targetCsvPath), { recursive: true });
      const csvContent = generateReportCsv({
        diff,
        oldRecords,
        newRecords: records,
        crawledMap
      });

      await writeFile(targetCsvPath, csvContent, 'utf-8');
      console.log(`📄 Exported full CSV report: ${targetCsvPath}`);
    }

    return { payload, diff };
  } finally {
    clearTimeout(keepAlive);
    unsubscribeLogger();
  }
};

/**
 * Configurable options for maintainers.
 * Only execute when explicitly requested via UPDATE_COLLECTIONS=true
 */
if (process.env.UPDATE_COLLECTIONS === 'true') {
  run({ isPrettyPrint: true, filterLowQualityRecords: true }).catch(error => {
    console.error('❌ Failed to update API collection:', error);
    process.exit(1);
  });
}

export {
  diffCollections,
  escapeCsvField,
  formatCsv,
  generateReportCsv,
  run,
  type ModifiedRecordReport,
  type RemovalReason,
  type RemovedRecordReport,
  type UpdateApiCollectionOptions
};

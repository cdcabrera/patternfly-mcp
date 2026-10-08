import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PatternFlyMcpDocsCatalog } from '../../src/docs.embedded';
import { fetchLatestRepoHashes } from './helpers';
import {
  diffDocsManifests,
  findApiRedundantDocs,
  generateDocsReportCsv,
  recalculateManifestMetadata,
  type ApiCollectionRecordRef,
  type DocsDiffResult
} from './docs.helpers';

/**
 * Options for running the documentation manifest collection update.
 */
interface UpdateDocsOptions {
  docsPath?: string | undefined;
  apiPath?: string | undefined;
  csvOutputPath?: string | undefined;
  pruneApiOverlap?: boolean | undefined;
  verifyReachability?: boolean | undefined;
  updateHashes?: boolean | undefined;
  isPrettyPrint?: boolean | undefined;
  outputCsv?: boolean | undefined;
}

/**
 * Log a structured diff summary of the documentation changes to the console.
 *
 * @param diff - Complete diff result
 */
const logDiffReport = (diff: DocsDiffResult) => {
  const { added, removed, modified } = diff;
  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;

  console.log('\n📊 PatternFly Docs Collection Diff Report:');

  if (!hasChanges) {
    console.log('   ✨ No record additions, removals, or property modifications detected.');

    return;
  }

  if (added.length > 0) {
    console.log(`   ➕ Added (${added.length}):`);
    added.slice(0, 10).forEach(item => {
      console.log(`      + [${item.category}] ${item.record.displayName} (${item.record.pathSlug})`);
    });

    if (added.length > 10) {
      console.log(`      ... and ${added.length - 10} more`);
    }
  }

  if (removed.length > 0) {
    console.log(`   ➖ Removed (${removed.length}):`);
    removed.slice(0, 15).forEach(item => {
      console.log(
        `      - [${item.category}] ${item.record.displayName} (${item.record.pathSlug}) [Reason: ${item.reason}${item.details ? ` — ${item.details}` : ''}]`
      );
    });

    if (removed.length > 15) {
      console.log(`      ... and ${removed.length - 15} more`);
    }
  }

  if (modified.length > 0) {
    console.log(`   🔄 Modified (${modified.length}):`);
    modified.slice(0, 10).forEach(item => {
      console.log(`      ~ [${item.category}] ${item.record.displayName} [${item.reasons.join(', ')}]`);
    });

    if (modified.length > 10) {
      console.log(`      ... and ${modified.length - 10} more`);
    }
  }
};

/**
 * Update the PatternFly Docs manifest collection, deduplicating against the API seed and syncing repository SHAs.
 *
 * @param [options={}] - Execution options
 * @returns Promise resolving to the diff result
 */
const run = async (options: UpdateDocsOptions = {}): Promise<DocsDiffResult> => {
  const docsPath =
    options.docsPath ||
    process.env.DOCS_COLLECTION_PATH ||
    resolve(fileURLToPath(new URL('../../src/docs.json', import.meta.url)));

  const apiPath =
    options.apiPath ||
    process.env.API_COLLECTION_PATH ||
    resolve(fileURLToPath(new URL('../../src/collection.patternFlyApi.json', import.meta.url)));

  const csvOutputPath =
    options.csvOutputPath ||
    process.env.CSV_DOCS_REPORT_PATH ||
    resolve(fileURLToPath(new URL('../../reports/collection.patternFlyDocs.report.csv', import.meta.url)));

  const pruneApiOverlap = options.pruneApiOverlap !== false;
  const updateHashes = options.updateHashes !== false;
  const isPrettyPrint = options.isPrettyPrint !== false;
  const outputCsv = options.outputCsv !== false;

  console.log('🚀 Updating PatternFly Docs manifest collection...');
  const startTime = Date.now();

  // 1. Read existing documentation catalog
  const rawDocs = await readFile(docsPath, 'utf-8');
  const oldCatalog: PatternFlyMcpDocsCatalog = JSON.parse(rawDocs);

  // 2. Read API collection for deduplication if enabled and present
  let apiRecords: ApiCollectionRecordRef[] = [];

  if (pruneApiOverlap && existsSync(apiPath)) {
    try {
      const rawApi = await readFile(apiPath, 'utf-8');
      const apiCatalog = JSON.parse(rawApi);

      apiRecords = apiCatalog.records || [];
    } catch {
      console.warn(`⚠️ Could not parse API collection at ${apiPath}. Skipping API deduplication.`);
    }
  }

  // 3. Identify redundant records superseded by API collection
  const redundantRecords = pruneApiOverlap ? findApiRedundantDocs(oldCatalog, apiRecords) : [];

  // 4. Fetch latest commit SHAs for tracked upstream repositories if enabled
  let latestHashes = new Map<string, string>();

  if (updateHashes) {
    latestHashes = await fetchLatestRepoHashes();
  }

  // 5. Build updated catalog and recalculate manifest metadata
  const updatedCatalog = recalculateManifestMetadata(oldCatalog, {
    redundantRecords,
    latestHashes: updateHashes ? latestHashes : undefined,
    verifyReachability: options.verifyReachability
  });

  // 6. Write updated documentation manifest
  const jsonContent = isPrettyPrint
    ? JSON.stringify(updatedCatalog, null, 2)
    : JSON.stringify(updatedCatalog);

  await writeFile(docsPath, jsonContent + '\n', 'utf-8');

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);

  console.log(`✅ Updated ${docsPath}:`);
  console.log(`   - Total Categories: ${updatedCatalog.meta.totalEntries}`);
  console.log(`   - Total Documents: ${updatedCatalog.meta.totalDocs}`);
  console.log(`   - File Size: ${sizeKb} KB`);
  console.log(`   - Time Elapsed: ${durationSec}s`);

  // 7. Calculate diff and print console summary
  const diff = diffDocsManifests(oldCatalog, updatedCatalog, redundantRecords);

  logDiffReport(diff);

  // 8. Generate and save CSV report if requested
  if (outputCsv) {
    await mkdir(dirname(csvOutputPath), { recursive: true });
    const csvContent = generateDocsReportCsv(diff);

    await writeFile(csvOutputPath, csvContent, 'utf-8');
    console.log(`📄 Exported full CSV report: ${csvOutputPath}`);
  }

  return diff;
};

/**
 * Direct execution when invoked via UPDATE_COLLECTIONS=true
 */
if (process.env.UPDATE_COLLECTIONS === 'true') {
  run().catch(error => {
    console.error('❌ Failed to update Docs collection:', error);
    process.exit(1);
  });
}

export {
  logDiffReport,
  run,
  type UpdateDocsOptions
};

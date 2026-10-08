import {
  type ApiContent,
  type ApiCrawler,
  type ApiEmbedded,
  MIN_API_QUALITY_THRESHOLD
} from '../../src/collection.patternFlyApi';
import {
  buildCsvReport,
  escapeCsvField,
  formatCsv
} from './collections.helpers';

/**
 * Reason classification for omitted or removed API records.
 */
type RemovalReason =
  'lacks quality' |
  'empty response' |
  'deferred category' |
  'upstream removed' |
  'other';

/**
 * Entry describing a removed record with its determined reason and details.
 */
interface RemovedRecordReport {
  record: ApiEmbedded;
  reason: RemovalReason;
  details?: string | undefined;
}

/**
 * Entry describing a modified record and the changed fields.
 */
interface ModifiedRecordReport {
  record: ApiEmbedded;
  reasons: string[];
}

/**
 * Options for generating CSV report output.
 */
interface GenerateCsvReportOptions {
  diff: {
    added: ApiEmbedded[];
    removed: RemovedRecordReport[];
    modified: ModifiedRecordReport[];
  };
  oldRecords: ApiEmbedded[];
  newRecords: ApiEmbedded[];
  crawledMap: Map<string, { entry: ApiCrawler; metadata: ApiContent }>;
}

/**
 * Generate a complete, non-truncated CSV report for additions, removals, modifications, and unchanged records.
 *
 * @param options - Generation options
 * @param options.diff - Diff calculation between old and new records
 * @param options.oldRecords - Previous collection records
 * @param options.newRecords - Current collection records
 * @param options.crawledMap - Map of crawled entries and metadata
 * @returns Formatted RFC 4180 CSV string
 */
const generateReportCsv = ({
  diff,
  oldRecords,
  newRecords,
  crawledMap
}: GenerateCsvReportOptions): string => {
  const oldMap = new Map(oldRecords.map(record => [record.p, record]));
  const headers = [
    'status',
    'path',
    'name',
    'previousQualityScore',
    'newQualityScore',
    'contentType',
    'reason',
    'details'
  ];
  const rows: (string | number | undefined | null)[][] = [];

  for (const record of diff.added) {
    rows.push(['ADDED', record.p, record.n, '', record.q, record.c, '', '']);
  }

  for (const { record, reason, details } of diff.removed) {
    const newQualityScore = crawledMap.get(record.p)?.entry.qualityScore ?? '';

    rows.push([
      'REMOVED',
      record.p,
      record.n,
      record.q,
      newQualityScore,
      record.c,
      reason,
      details || ''
    ]);
  }

  for (const { record, reasons } of diff.modified) {
    const previousQualityScore = oldMap.get(record.p)?.q ?? '';

    rows.push([
      'MODIFIED',
      record.p,
      record.n,
      previousQualityScore,
      record.q,
      record.c,
      'property changes',
      reasons.join('; ')
    ]);
  }

  const changedPaths = new Set([
    ...diff.added.map(record => record.p),
    ...diff.removed.map(removedItem => removedItem.record.p),
    ...diff.modified.map(modifiedItem => modifiedItem.record.p)
  ]);

  for (const record of newRecords) {
    if (!changedPaths.has(record.p)) {
      rows.push(['UNCHANGED', record.p, record.n, record.q, record.q, record.c, '', '']);
    }
  }

  return buildCsvReport({ headers, rows });
};

/**
 * Create a diff report with annotated reasons between old and new collections.
 *
 * @param oldRecords - Previous collection
 * @param newRecords - Updated collection
 * @param crawledMap - Map of all crawled entries and evaluated metadata
 * @returns Structured diff result
 */
const diffCollections = (
  oldRecords: ApiEmbedded[],
  newRecords: ApiEmbedded[],
  crawledMap: Map<string, { entry: ApiCrawler; metadata: ApiContent }>
) => {
  const oldMap = new Map(oldRecords.map(record => [record.p, record]));
  const newMap = new Map(newRecords.map(record => [record.p, record]));

  const added = newRecords.filter(record => !oldMap.has(record.p));

  const removed: RemovedRecordReport[] = [];

  for (const oldRecord of oldRecords) {
    if (newMap.has(oldRecord.p)) {
      continue;
    }

    const crawled = crawledMap.get(oldRecord.p);

    if (!crawled) {
      removed.push({
        record: oldRecord,
        reason: 'upstream removed',
        details: 'Endpoint no longer referenced upstream'
      });
    } else if (
      !crawled.entry.content ||
      crawled.entry.content.trim() === '' ||
      crawled.entry.content === '{}' ||
      crawled.entry.content === '[]'
    ) {
      removed.push({
        record: oldRecord,
        reason: 'empty response',
        details: 'Empty payload returned'
      });
    } else if (crawled.metadata.isDeferred) {
      removed.push({
        record: oldRecord,
        reason: 'deferred category',
        details: `Category '${crawled.metadata.category}' is deferred`
      });
    } else if (
      crawled.metadata.isLowQuality ||
      crawled.entry.qualityScore < MIN_API_QUALITY_THRESHOLD
    ) {
      removed.push({
        record: oldRecord,
        reason: 'lacks quality',
        details: `Evaluated Q: ${crawled.entry.qualityScore} < ${MIN_API_QUALITY_THRESHOLD} threshold`
      });
    } else {
      removed.push({
        record: oldRecord,
        reason: 'other',
        details: `Excluded during crawl processing (Q: ${crawled.entry.qualityScore})`
      });
    }
  }

  const modified: ModifiedRecordReport[] = [];

  for (const record of newRecords) {
    const prev = oldMap.get(record.p);

    if (!prev) {
      continue;
    }

    const reasons: string[] = [];

    if (prev.q !== record.q) {
      reasons.push(`quality score (${prev.q} -> ${record.q})`);
    }

    if (prev.n !== record.n) {
      reasons.push(`name ("${prev.n}" -> "${record.n}")`);
    }

    if (prev.d !== record.d) {
      reasons.push('description updated');
    }

    if (prev.c !== record.c) {
      reasons.push(`content-type (${prev.c} -> ${record.c})`);
    }

    if (reasons.length > 0) {
      modified.push({ record, reasons });
    }
  }

  return { added, removed, modified };
};

/**
 * Log a structured diff summary of collection changes to the console.
 *
 * @param diff - Diff report
 */
const diffReport = (diff: ReturnType<typeof diffCollections>) => {
  const { added, removed, modified } = diff;
  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;

  console.log('\n📊 Collection Diff Report:');

  if (!hasChanges) {
    console.log('   ✨ No record additions, removals, or property modifications detected.');

    return;
  }

  if (added.length > 0) {
    console.log(`   ➕ Added (${added.length}):`);
    added.slice(0, 10).forEach(record => console.log(`      + ${record.p} (Q: ${record.q})`));

    if (added.length > 10) {
      console.log(`      ... and ${added.length - 10} more`);
    }
  }

  if (removed.length > 0) {
    console.log(`   ➖ Removed (${removed.length}):`);
    removed.slice(0, 15).forEach(({ record, reason, details }) => {
      console.log(
        `      - ${record.p} (Previous Q: ${record.q}) [Reason: ${reason}${details ? ` — ${details}` : ''}]`
      );
    });

    if (removed.length > 15) {
      console.log(`      ... and ${removed.length - 15} more`);
    }
  }

  if (modified.length > 0) {
    console.log(`   🔄 Modified (${modified.length}):`);
    modified.slice(0, 10).forEach(({ record, reasons }) => {
      console.log(`      ~ ${record.p} [${reasons.join(', ')}]`);
    });

    if (modified.length > 10) {
      console.log(`      ... and ${modified.length - 10} more`);
    }
  }
};

export {
  diffCollections,
  diffReport,
  escapeCsvField,
  formatCsv,
  generateReportCsv,
  type GenerateCsvReportOptions,
  type ModifiedRecordReport,
  type RemovalReason,
  type RemovedRecordReport
};

import { type CollectionSource, type CollectionRecord } from './records';
import { EMBEDDED_DOCS, type PatternFlyMcpDocsCatalog } from './docs.embedded';
import { formatUnknownError, log } from './logger';

const getPatternFlyDocsCatalog = async (): Promise<PatternFlyMcpDocsCatalog & { isFallback: boolean }> => {
  let docsCatalog = EMBEDDED_DOCS;
  let isFallback = false;

  try {
    if (process.env.NODE_ENV === 'local') {
      docsCatalog = (await import('./docs.json', { with: { type: 'json' } })).default;
    } else {
      docsCatalog = (await import('#docsCatalog', { with: { type: 'json' } })).default;
    }
  } catch (error) {
    isFallback = true;
    log.debug(`Failed to import docs catalog '#docsCatalog': ${formatUnknownError(error)}`, 'Using fallback docs catalog.');
  }

  return { ...docsCatalog, isFallback };
};

/**
 * Collection representing local static docs.json (EMBEDDED_DOCS / local import).
 */
const patternFlyDocsCollection = (): CollectionSource => {
  const callback = async () => {
    const docsCatalog = await getPatternFlyDocsCatalog();
    const catalog = [...Object.entries(docsCatalog.docs)];
    const recordsMap: Map<string, CollectionRecord> = new Map();

    catalog.forEach(([name, entries]) => {
      const normalizedName = name.toLowerCase();
      const id = `docs::${normalizedName}`;

      if (recordsMap.has(id)) {
        return;
      }

      const record = {
        id,
        sourceId: normalizedName,
        sourceType: 'local' as const,
        data: {
          [normalizedName]: entries
        }
      };

      recordsMap.set(record.id, record);
    });

    /*
    const records = Object.values(catalog.byPath || {}).map((entry: any) => ({
      id: `docs::${entry.hash || generateHash(entry.path)}`,
      sourceId: entry.path,
      sourceType: 'local' as const,
      title: entry.title,
      content: entry.content,
      category: entry.category,
      section: entry.section
    }));
     */

    return { records: [...recordsMap.values()], isFallback: docsCatalog.isFallback };
  };

  return [
    'patternfly-docs',
    callback,
    {
      runInChildProcess: false,
      isInternal: true,
      isRequired: true
    }
  ];
};

export { patternFlyDocsCollection };

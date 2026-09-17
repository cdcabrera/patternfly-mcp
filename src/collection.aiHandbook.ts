import { type McpCollection, type McpCollectionRecord } from './collections';
import { getOptions, getSessionOptions, runWithOptions, runWithSession } from './options.context';
import { formatUnknownError, log } from './logger';
import {isPlainObject} from "./server.helpers";

/**
 * Lazy load the documentation catalog.
 *
 * @returns Documentation catalog JSON.
 */
const getCatalog = async (): Promise<Record<string, any>> => {
  let docsCatalog = { docs: {} };

  try {
    if (process.env.NODE_ENV === 'local') {
      docsCatalog = (await import('./collection.aiHandbook.json', { with: { type: 'json' } })).default;
    } else {
      docsCatalog = (await import('#aiHandbookCatalog', { with: { type: 'json' } })).default;
    }
  } catch (error) {
    log.debug(`Failed to import AI Handbook catalog '#aiHandbookCatalog': ${formatUnknownError(error)}`);
  }

  return { ...docsCatalog };
};

/**
 * Async collect and process entries for a collection.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async () => {
  const docsCatalog = await getCatalog();
  const catalog = [...Object.entries(docsCatalog.docs)];
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  catalog.forEach(([name, entries]) => {
    const normalizedName = name.toLowerCase();
    const id = `docs::ai-handbook::${normalizedName}`;

    if (recordsMap.has(id) || !Array.isArray(entries)) {
      return;
    }

    const record = {
      id,
      sourceId: normalizedName,
      sourceType: 'local' as const,
      data: {
        [normalizedName]: entries.filter(entry => isPlainObject(entry)).map(data => ({
          ...data,
          collection: 'ai-handbook' as const
        }))
      }
    };

    recordsMap.set(record.id, record);
  });

  return { records: [...recordsMap.values()] };
};

/**
 * Create an AI Handbook local embedded collection.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const aiHandbookCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[1] = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback()));

  return [
    'ai-handbook',
    callback,
    { isRequired: false }
  ];
};

export { aiHandbookCollection, collectionCallback };

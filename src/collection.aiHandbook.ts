import { processDocsFunction } from './server.getResources';
import { type McpCollection, type McpCollectionRecord } from './collections';
import { getOptions, getSessionOptions, runWithOptions, runWithSession } from './options.context';
import { formatUnknownError, log } from './logger';
import { isPlainObject } from './server.helpers';
import {collectionInitialCallback} from "#collectionPatternFlyApi";
// import {ApiCrawler} from "#collectionPatternFlyApi";

const COLLECTION_DOCS = 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json';

/**
 * Lazy load the documentation catalog.
 *
 * @param [collectionDocs] - URL to the documentation catalog JSON.
 * @returns Documentation catalog JSON.
 */
const getCatalog = async (collectionDocs = COLLECTION_DOCS): Promise<Record<string, any>> => {
  let docsCatalog = { docs: {} };

  const settled = await processDocsFunction([collectionDocs]) || [];

  for (const res of settled) {
    if (!res.isSuccess) {
      continue;
    }

    // log.debug(`AI Handbook catalog '${collectionDocs}' loaded`);

    try {
      const docsJson = typeof res.content === 'string' ? JSON.parse(res.content) : res.content;

      if (isPlainObject(docsJson.docs)) {
        docsCatalog = docsJson;
      }

      log.debug(`docsCatalog.docs ${Object.keys(docsCatalog.docs).join('\n')}`);
    } catch (error) {
      log.debug(`Failed to parse AI Handbook '${collectionDocs}': ${formatUnknownError(error)}`);
    }

    // docsCatalog.docs = isPlainObject(res.content) || Array.isArray(res.content) ? res.content : {};
  }

  return { ...docsCatalog };

  /*
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
  */
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
    {
      isRequired: false,
      // ToDo: looks like we may need a default for "initial" and assume it will just be empty until it can load
      //  in order to get the registration to fire if we want dynamic filters in the MCP tools, like the
      //  "collections" filter
      initial: () => ({ records: [] }),
      retainLastViable: true
    }
  ];
};

export { aiHandbookCollection, collectionCallback };

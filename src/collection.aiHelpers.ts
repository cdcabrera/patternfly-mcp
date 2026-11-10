import { type McpCollection, type McpCollectionRecord } from './collections';
import { type PatternFlyMcpDocsCatalog, type PatternFlyMcpDocsCatalogDoc } from './docs.embedded';
import { formatUnknownError, log } from './logger';
import { isPlainObject } from './server.helpers';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';

/**
 * Lazy load the AI Helpers documentation catalog.
 *
 * @returns AI Helpers catalog JSON, or an empty catalog if import fails.
 */
const getAiHelpersCatalog = async (): Promise<PatternFlyMcpDocsCatalog> => {
  try {
    if (process.env.NODE_ENV === 'local') {
      return (await import('./collection.aiHelpers.json', { with: { type: 'json' } })).default;
    }

    return (await import('#aiHelpersCatalog', { with: { type: 'json' } })).default;
  } catch (error) {
    log.warn(`Failed to load embedded AI Helpers catalog '#aiHelpersCatalog': ${formatUnknownError(error)}`);

    return {
      meta: {
        totalEntries: 0,
        totalDocs: 0,
        source: 'patternfly-mcp-ai-helpers-unavailable'
      },
      docs: {}
    };
  }
};

/**
 * Async collect and process entries for a collection.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async () => {
  const docsCatalog = await getAiHelpersCatalog();
  const catalog = [...Object.entries(docsCatalog.docs)];
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  catalog.forEach(([name, entries]) => {
    const normalizedName = name.toLowerCase();
    const id = `docs::ai-helpers::${normalizedName}`;

    if (recordsMap.has(id) || !Array.isArray(entries)) {
      return;
    }

    const record = {
      id,
      sourceId: normalizedName,
      sourceType: 'local' as const,
      data: {
        [normalizedName]: entries.filter(entry => isPlainObject(entry)).map(data => ({
          ...(data as PatternFlyMcpDocsCatalogDoc),
          collection: 'ai-helpers' as const
        }))
      }
    };

    recordsMap.set(record.id, record);
  });

  return { records: [...recordsMap.values()] };
};

/**
 * Create an AI Helpers local embedded collection from `collection.aiHelpers.json`.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const aiHelpersCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[2] = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback()));

  return [
    'ai-helpers',
    {
      title: 'AI Helpers'
    },
    callback,
    {
      isRequired: true,
      retainLastViable: true
    }
  ];
};

export { aiHelpersCollection, collectionCallback, getAiHelpersCatalog };

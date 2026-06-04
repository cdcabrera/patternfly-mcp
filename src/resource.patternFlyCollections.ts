import {
  ResourceTemplate,
  type ListResourcesCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type McpResource,
  type McpResourceListResult,
  type McpResourceMetadataComplete,
  type McpResourceMetadataCompleteMemo
} from './mcpSdk';
import { memo } from './server.caching';
import { findClosest } from './server.search';
import { assertInput, assertInputStringShaHex } from './server.assertions';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import {
  type ContextManagementCollectionRecord,
  type ContextManagementPatternFlyIdRecord,
  getPatternFlyContextManagementResources
} from './patternFly.getResourcesContext';
import {
  formatResourceContent,
  formatSummaryFullContent,
  nextCursor
} from './resource.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-collections';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://collections/{id}{?detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly ID and detail. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Collections Index',
  description: `A list of PatternFly collections for resources and components. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown',
  annotations: {
    priority: 0.9,
    audience: ['assistant' as const]
  }
};

/**
 * Index list. List resources callback for the URI template.
 *
 * @param _extra - Extra parameters.
 * @param cursor - The passed back cursor/page for pagination.
 * @returns The list of available resources.
 */
const listResources = async (_extra: unknown, cursor?: string | undefined) => {
  const pageSize = 15;
  const { collectionsIndex } = await getPatternFlyContextManagementResources.memo();
  const collectionsList = Array.from(collectionsIndex.values());

  const { start, end, next } = nextCursor({ cursor, pageSize, size: collectionsList.length });
  const resources: McpResourceListResult[] = [];

  collectionsList.slice(start, end).forEach((entry, index) => {
    const actualIndex = start + index + 1;

    resources.push({
      uri: `patternfly://collections/${entry.id}`,
      name: `${entry.displayName} Collection (${actualIndex}/${collectionsList.length})`,
      description: entry.description,
      mimeType: 'text/markdown'
    });
  });

  return {
    totalCount: collectionsList.length,
    pageSize,
    nextCursor: next,
    resources
  };
};

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * URI id completion callback.
 *
 * @param id - The value to complete.
 * @returns The list of available IDs.
 */
const uriIdComplete: McpResourceMetadataCompleteMemo = async (id: string) => {
  const { collectionsIndex } = await getPatternFlyContextManagementResources.memo();
  const collectionsList = Array.from(collectionsIndex.values());

  const searchStr = (id || '').toLowerCase();
  const matches = collectionsList.filter(record =>
    record.id.toLowerCase().includes(searchStr) ||
    record.name.toLowerCase().includes(searchStr));

  return matches.map(record => record.id);
};

/**
 * Memoized version of uriIdComplete.
 */
uriIdComplete.memo = memo(uriIdComplete);

/**
 * Detail completion callback for the URI template.
 *
 * @param detail - The value to complete.
 * @returns The list of available details.
 */
const uriDetailComplete: McpResourceMetadataCompleteMemo = async (detail: string) => {
  const levels = ['summary', 'full'];
  const closest = findClosest.memo(detail, levels) as string | undefined;

  return closest ? [closest] : [];
};

/**
 * Memoized version of uriDetailComplete.
 */
uriDetailComplete.memo = memo(uriDetailComplete);

/**
 * Empty resource template.
 *
 * @param params
 * @param params.collection - Collection for loading resources.
 * @param params.passedUri - URI of the resource.
 * @returns Empty resource contents.
 */
const resourceEmptyTemplate = ({
  collection,
  passedUri
}: { collection: ContextManagementCollectionRecord; passedUri: URL }) => {
  const content = stringJoin.newline(
    `# ${collection.displayName} (Empty collection)`,
    '',
    collection.description,
    '',
    `## Collection record summary (0/0):`,
    'No records found in this collection.'
  );

  return {
    contents: [{
      uri: passedUri.toString(),
      mimeType: 'text/markdown',
      text: formatResourceContent(content, {
        frontMatter: { name: collection.name }
      })
    }]
  };
};

/**
 * Summary resource template.
 *
 * @param params
 * @param params.collection - Collection for loading resources.
 * @param params.records - Records for loading resources.
 * @param params.detail - Detail level for resources.
 * @param params.passedUri - URI of the resource.
 */
const resourceSummaryTemplate = ({
  collection,
  records,
  detail,
  passedUri
}: { collection: ContextManagementCollectionRecord; records: ContextManagementPatternFlyIdRecord[]; detail: 'summary' | 'full'; passedUri: URL }) => {
  const updatedRecords = records.slice(0, 10);

  const content = stringJoin.newline(
    `# ${collection.displayName} (Collection summary)`,
    '',
    collection.description,
    '',
    `## Collection ${records.length === 1 ? 'record' : 'records'} summary (${updatedRecords.length}/${records.length}):`,
    ...updatedRecords.map(record => `- [${record.displayName} ${record.displayCategory} (${record.version})](${record.uri})`)
  );

  return {
    contents: [{
      uri: passedUri.toString(),
      mimeType: 'text/markdown',
      text: formatSummaryFullContent(content, {
        url: collection.uri,
        detailType: detail,
        frontMatter: { name: collection.name },
        summaryLength: content.length
      })
    }]
  };
};

/**
 * Summary resource template.
 *
 * @param params
 * @param params.collection - Collection for loading resources.
 * @param params.records - Records for loading resources.
 * @param params.detail - Detail level for resources.
 * @param params.passedUri - URI of the resource.
 */
const resourceFullTemplate = ({
  collection,
  records,
  detail,
  passedUri
}: { collection: ContextManagementCollectionRecord; records: ContextManagementPatternFlyIdRecord[]; detail: 'summary' | 'full'; passedUri: URL }) => {
  const content = [
    `# ${collection.displayName} (Collection)`,
    '',
    collection.description,
    '',
    `## Collection ${records.length === 1 ? 'record' : 'records'}  (${records.length}/${records.length}):`
  ];

  const categoriesSeen = new Set<string>();
  const collectionsContent: string[] = [];

  records.forEach(record => {
    if (!categoriesSeen.has(record.displayCategory)) {
      categoriesSeen.add(record.displayCategory);
      collectionsContent.push(`### ${record.displayCategory}`);
    }

    collectionsContent.push(`- [${record.displayName} (${record.version})](${record.uri})`);
  });

  content.push(...collectionsContent);

  return {
    contents: [{
      uri: passedUri.toString(),
      mimeType: 'text/markdown',
      text: formatSummaryFullContent(
        stringJoin.newline(...content),
        {
          url: collection.uri,
          detailType: detail,
          frontMatter: { name: collection.name },
          summaryLength: content.length
        }
      )
    }]
  };
};

/**
 * Main resource callback.
 *
 * @note Re-evaluate the use of empty collections; for empty records we throw an error.
 * Because we allow configuration, there is a chance it's intentional.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>) => {
  const { detail = 'full', id } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['full', 'summary']) || detail) as 'full' | 'summary';

  assertInputStringShaHex(id, {
    ...getOptions().minMax.inputStrings,
    inputDisplayName: 'id'
  });

  const { collectionsIndex, collectionsIdIndex } = await getPatternFlyContextManagementResources.memo();
  const collection = collectionsIndex.get(id);

  assertInput(
    collection !== undefined,
    () => `No collection found for "${id}". Try using a different ID.`
  );

  const collectionRecords = collectionsIdIndex.get(id) || [];
  // Sort by version, then name for scenarios where collections span versions.
  const records = collectionRecords
    .toSorted((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }) || a.displayName.localeCompare(b.displayName));

  if (records.length > 0) {
    return resourceEmptyTemplate({ collection, passedUri });
  }

  if (normalizedDetail === 'summary') {
    return resourceSummaryTemplate({ collection, records, detail: normalizedDetail, passedUri });
  }

  return resourceFullTemplate({ collection, records, detail: normalizedDetail, passedUri });
};

/**
 * Memoized version of resourceCallback.
 */
resourceCallback.memo = memo(resourceCallback, DEFAULT_OPTIONS.toolMemoOptions.mcpResources);

/**
 * PatternFly Collections Resource creator.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyCollectionsResource = (options = getOptions()): McpResource => {
  const list: ListResourcesCallback = async (...args) => runWithOptions(options, async () => listResources.memo(...args));

  const complete: { [callback: string]: McpResourceMetadataComplete } = {
    id: async (...args) => runWithOptions(options, async () => uriIdComplete.memo(...args)),
    detail: async (...args) => runWithOptions(options, async () => uriDetailComplete.memo(...args))
  };

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback.memo(uri, variables));

  return [
    NAME,
    new ResourceTemplate(URI_TEMPLATE, {
      list,
      complete
    }),
    CONFIG,
    callback,
    {
      complete,
      registerAllSearchCombinations: true,
      metaConfig: {
        uri: 'patternfly://collections/meta{?detail}',
        title: `${CONFIG.title} Metadata`,
        description: 'Discover available parameters for PatternFly collections.'
      }
    },
    {
      shouldRegister: opts => opts.contextManagement === true
    }
  ];
};

export {
  patternFlyCollectionsResource,
  listResources,
  resourceCallback,
  uriDetailComplete,
  uriIdComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

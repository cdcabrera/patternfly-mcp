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
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyContextManagementResources } from './patternFly.getResourcesContext';
import { formatSummaryFullContent, nextCursor } from './resource.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import { assertInput, assertInputStringShaHex } from './server.assertions';
import { stringJoin } from './server.helpers';

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
    priority: 1.0,
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
 * Main resource callback.
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

  // const records = await filterPatternFlyContext.memo({ id });
  const { collectionsIndex, collectionsIdIndex } = await getPatternFlyContextManagementResources.memo();
  const collection = collectionsIndex.get(id as string);

  // const record = records.get(id);

  assertInput(
    collection !== undefined,
    () => `Collection not found for ID: ${id}`
  );

  const collectionRecords = collectionsIdIndex.get(id as string) || [];
  const sortedRecords = collectionRecords.toSorted((a, b) => a.displayName.localeCompare(b.displayName));

  const content = [
    `# ${collection.displayName}`,
    '',
    collection.description,
    '',
    `Found ${collectionRecords.length} related PatternFly resources.`,
    'Use the links below to access detailed technical documentation and specifications.',
    ''
  ];

  if (sortedRecords.length > 0) {
    const categoriesSeen = new Set<string>();
    const collectionsContent: string[] = [];

    sortedRecords.forEach(record => {
      const isTechSpec = record.lookup().isComponent;
      const updatedCategory = isTechSpec ? 'Technical Specifications' : record.displayCategory;

      if (!categoriesSeen.has(updatedCategory)) {
        categoriesSeen.add(updatedCategory);
        collectionsContent.push(`### ${updatedCategory}`);
      }

      collectionsContent.push(`- [${record.displayName}](${record.uri})`);
    });

    content.push(...collectionsContent);
  }

  return {
    contents: [
      {
        uri: passedUri.toString(),
        mimeType: CONFIG.mimeType,
        text: formatSummaryFullContent(stringJoin.newline(...content), {
          url: collection.uri,
          detailType: normalizedDetail,
          frontMatter: {
            name: collection.name
          }
        })
      }
    ]
  };
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
      registerAllSearchCombinations: true
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

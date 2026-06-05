import {
  ResourceTemplate,
  type ListResourcesCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  type McpResource,
  type McpResourceListResult,
  type McpResourceMetadataComplete,
  type McpResourceMetadataCompleteMemo
} from './mcpSdk';
import { memo } from './server.caching';
import { findClosest } from './server.search';
import { getOptions, runWithOptions } from './options.context';
import {
  getPatternFlyContextManagementResources,
  type ContextManagementPatternFlyHashRecord
} from './patternFly.getResources';
import { filterPatternFlyContext } from './patternFly.search';
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
  const { start, end, next } = nextCursor({ cursor, pageSize, size: collectionsIndex.length });
  const resources: McpResourceListResult[] = [];

  collectionsIndex.slice(start, end).forEach((entry, index) => {
    const actualIndex = start + index + 1;

    resources.push({
      uri: `patternfly://collections/${entry.id}`,
      name: `${entry.displayName} Collection Hub (${actualIndex}/${collectionsIndex.length})`,
      description: entry.description,
      mimeType: 'text/markdown'
    });
  });

  return {
    totalCount: collectionsIndex.length,
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

  const searchStr = (id || '').toLowerCase();
  const matches = collectionsIndex.filter(record =>
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
  const { detail = 'summary', id } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['full', 'summary']) || detail) as 'full' | 'summary';

  assertInputStringShaHex(id, {
    ...getOptions().minMax.inputStrings,
    inputDisplayName: 'id'
  });

  const records = await filterPatternFlyContext.memo({ id });
  const record = records.get(id);

  assertInput(
    record?.isCollection !== undefined,
    () => `Collection not found for ID: ${id}`
  );

  // Fetch all records for this name to build the hub
  // This highlights we might need a different approach on the filtering... like a negation or passing a function/callback for the filter
  // like `section: (arg) => arg !== 'components'`, and maybe it should also be dynamic enough to allow filtering ON ALL available properties
  // so we don't have to worry about adding or updating the filter function.
  // const techSpecs = await filterPatternFlyContext.memo({ name: record.name, section: 'components', category: 'react', isCollection: false });
  // const notTechSpecs = await filterPatternFlyContext.memo({ name: record.name, section: (arg) => arg !== 'components', category: (arg) => arg !== 'react', isCollection: false
  // }); OR we return a broken out object like const { filtered, remaining } = await filterPatternFlyContext.memo...
  const foundCollection = await filterPatternFlyContext.memo({ name: record.name });
  const collection: ContextManagementPatternFlyHashRecord[] = Array
    .from(foundCollection.values()).toSorted(({ displayName: displayNameA }, { displayName: displayNameB }) => displayNameA.localeCompare(displayNameB));

  const techRecords = collection.filter(record => record.section === 'components' && record.category === 'react');

  const resultsContent = stringJoin.basic(
    `Found ${collection.length} related documentation ${collection.length === 1 ? 'resource' : 'resources'},`,
    `and ${techRecords.length} related technical ${techRecords.length === 1 ? 'specification' : 'specifications'}.`,
    'Use the attached documentation and component IDs to discover more PatternFly context.'
  );

  const content = [
    `# ${record.displayName}`,
    '',
    record.description,
    '',
    resultsContent,
    ''
  ];

  if (collection.length > 0) {
    const categoriesSeen = new Set<string>();
    const collectionsContent: string[] = [];

    collection.forEach(record => {
      const isTechSpec = record.category === 'react' && record.section === 'components';
      const recordUri = isTechSpec ? record.componentUri : record.uri;

      if (!categoriesSeen.has(record.category)) {
        const updatedCategory = isTechSpec ? 'Technical Specifications' : record.displayCategory;

        categoriesSeen.add(updatedCategory);
        collectionsContent.push(isTechSpec ? '### Technical Specifications' : `### ${record.displayCategory}`);
      }

      collectionsContent.push(`- [${record.displayName}](${recordUri})`);
    });

    content.push(...collectionsContent);
  }

  return {
    contents: [
      {
        uri: passedUri.toString(), // placing "passed uri on here" means the detail may come through
        // uri: `patternfly://collections/${record.id}`
        mimeType: CONFIG.mimeType,
        text: formatSummaryFullContent(stringJoin.newline(...content), {
          url: `patternfly://collections/${record.id}`,
          detailType: normalizedDetail,
          frontMatter: {
            name: record.name
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

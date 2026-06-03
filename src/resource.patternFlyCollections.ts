import {
  ResourceTemplate,
  type ListResourcesCallback,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './mcpSdk';
import { memo } from './server.caching';
import { findClosest } from './server.search';
import { getOptions, runWithOptions } from './options.context';
import {
  getPatternFlyContextManagementResources,
  type ContextManagementPatternFlyHashRecord
} from './patternFly.getResources';
import { filterPatternFlyContext } from './patternFly.search';
import { nextCursor } from './resource.helpers';

/**
 * Extended callback type that combines the `CompleteResourceTemplateCallback` type
 * and an additional `memo` property.
 *
 * @extends CompleteResourceTemplateCallback
 */
type ExtendedCompleteResourceTemplateCallback = { memo: CompleteResourceTemplateCallback } & CompleteResourceTemplateCallback;

/**
 * List resources result type.
 */
type PatternFlyListResourceResult = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
};

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
const URI_DESCRIPTION = `Filter by PatternFly Collection ID and detail. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Collections Index',
  description: `A list of PatternFly collection hubs for components and general topics. ${URI_DESCRIPTION}`,
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
  const resources: PatternFlyListResourceResult[] = [];

  collectionsIndex.slice(start, end).forEach((entry, index) => {
    const actualIndex = start + index + 1;

    resources.push({
      uri: entry.collectionUri!,
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
 * Main resource callback.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>) => {
  const { id } = variables || {};

  if (!id || typeof id !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'The "id" parameter is required.');
  }

  const records = await filterPatternFlyContext.memo({ id });
  const record = records.get(id);

  if (!record || !record.isGroup) {
    throw new McpError(ErrorCode.InvalidParams, `Collection hub not found for ID: ${id}`);
  }

  // Fetch all records for this name to build the hub
  const allRecordsMap = await filterPatternFlyContext.memo({ name: record.name });
  const allRecords = Array.from(allRecordsMap.values());
  const techSpecs = allRecords.filter(record => record.section === 'components' && record.category === 'react' && !record.isGroup);
  const docs = allRecords.filter(record => (record.section !== 'components' || record.category !== 'react') && !record.isGroup);

  let content = `---\npfmcp_collection: ${record.collectionUri}\npfmcp_name: ${record.name}\n---\n`;

  content += `# ${record.displayName} Collection Hub\n\n`;
  content += `${record.description}\n\n`;

  content += `Found ${techSpecs.length} total related technical specifications and ${docs.length} documentation resources. Use the attached documentation and component IDs to discover more PatternFly context.\n\n`;

  if (techSpecs.length > 0) {
    content += '### Technical Specifications\n';
    techSpecs.forEach(spec => {
      content += `- [${spec.displayName}](${spec.componentUri})\n`;
    });
    content += '\n';
  }

  if (docs.length > 0) {
    content += '### Documentation & Guidelines\n';

    // Group docs by displayCategory
    const byCategory = docs.reduce((acc, doc) => {
      const cat = doc.displayCategory;

      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push(doc);

      return acc;
    }, {} as Record<string, ContextManagementPatternFlyHashRecord[]>);

    Object.entries(byCategory).forEach(([category, catDocs]) => {
      content += `#### ${category}\n`;
      catDocs.forEach(doc => {
        content += `- [${doc.displayName}](${doc.uri})\n`;
      });
      content += '\n';
    });
  }

  return {
    contents: [
      {
        uri: passedUri.toString(),
        mimeType: CONFIG.mimeType,
        text: content
      }
    ]
  };
};

/**
 * Memoized version of resourceCallback.
 */
resourceCallback.memo = memo(resourceCallback);

/**
 * URI id completion callback.
 *
 * @param id - The value to complete.
 * @returns The list of available IDs.
 */
const uriIdComplete: ExtendedCompleteResourceTemplateCallback = async (id: string) => {
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
 * URI detail completion callback.
 *
 * @param detail - The value to complete.
 * @returns The list of available details.
 */
const uriDetailComplete: ExtendedCompleteResourceTemplateCallback = async (detail: string) => {
  const levels = ['summary', 'full'];
  const closest = findClosest.memo(detail, levels) as string | undefined;

  return closest ? [closest] : [];
};

/**
 * Memoized version of uriDetailComplete.
 */
uriDetailComplete.memo = memo(uriDetailComplete);

/**
 * PatternFly Collections Resource creator.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyCollectionsResource = (options = getOptions()): McpResource => {
  const list: ListResourcesCallback = async (...args) => runWithOptions(options, async () => listResources.memo(...args));

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    id: async (...args) => runWithOptions(options, async () => uriIdComplete.memo(...args)),
    detail: async (...args) => runWithOptions(options, async () => uriDetailComplete.memo(...args))
  };

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback(uri, variables));

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

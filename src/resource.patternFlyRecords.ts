import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  ResourceTemplate,
  type ListResourcesCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type McpResource,
  type McpResourceListResult,
  type McpResourceMetadataComplete
} from './mcpSdk';
import { memo } from './server.caching';
import { buildSearchString, stringJoin } from './server.helpers';
import {
  assertInput,
  assertInputStringShaHex
} from './server.assertions';
import { findClosest } from './server.search';
import { processDocsFunction } from './server.getResources';
import { getOptions, runWithOptions } from './options.context';
import {
  getPatternFlyComponentSchema,
  getPatternFlyContextManagementResources,
  type ContextManagementPatternFlyIdRecord
} from './patternFly.getResourcesContext';
import {
  filterPatternFlyContext
} from './patternFly.searchContext';
import {
  formatSummaryFullContent,
  nextCursor
} from './resource.helpers';
import { uriDetailComplete } from './resource.patternFlyCollections';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-records';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://records/{id}{?detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly Record ID and detail. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Records Index',
  description: `A list of all PatternFly records including documentation and component technical specs. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown',
  annotations: {
    priority: 0.9,
    audience: ['assistant' as const]
  }
};

/**
 * List resources callback for the unified records index.
 *
 * @param _extra
 * @param cursor
 */
const listResources = async (_extra: unknown, cursor?: string | undefined) => {
  const pageSize = 15;
  const { recordsList } = await getPatternFlyContextManagementResources.memo();
  const { start, end, next } = nextCursor({ cursor, pageSize, size: recordsList.length });
  const resources: McpResourceListResult[] = [];

  recordsList.slice(start, end).forEach((entry, index) => {
    const actualIndex = start + index + 1;

    resources.push({
      uri: entry.uri,
      mimeType: 'text/markdown',
      name: `${entry.displayName} (${actualIndex}/${recordsList.length})`,
      description: entry.description
    });
  });

  return {
    totalCount: recordsList.length,
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
 * Specialized handler for component technical specifications.
 *
 * @param record
 * @param detail
 * @param passedUri
 * @param options
 */
const handleComponentRecord = async (
  record: ContextManagementPatternFlyIdRecord,
  detail: 'summary' | 'full'
  // passedUri: URL
) => {
  // Logic ported and optimized from resource.patternFlyComponents.ts
  /*
  if (!record.lookup().isSchemasAvailable) {
    return {
      contents: [{
        uri: passedUri.toString(),
        mimeType: 'text/markdown',
        text: stringJoin.newline(
          `# ${record.displayName} (Technical specifications unavailable)`,
          '',
          `Technical specifications and JSON schemas are not available for **${record.displayName}**.`,
          '',
          `Basic documentation is still accessible via this record.`
        )
      }]
    };
  }*/

  /*
  // Get related records for cross-linking (PEER DISCOVERY)
  const allRecordsMap = await filterPatternFlyContext.memo({ name: record.name, version: record.version });
  const allRecords = Array.from(allRecordsMap.values());

  const schema = await getPatternFlyComponentSchema.memo(record.name);
  const properties = schema?.properties || {};
  const propNames = Object.keys(properties).join(', ') || 'None';

  const content = [
    `# ${record.name} (Technical ${detail === 'summary' ? 'overview' : 'specifications'})`,
    `- **Version:** ${record.version}`,
    `- **Available Props:** ${propNames}`,
    ''
  ];

  // Cross-links to other facets of the same component
  const categories = new Set(allRecords.map(record => record.displayCategory));
  const categoryLinks = Array.from(categories).sort()
    .map(category => `[${category}](${record.uri}${buildSearchString({ category }, { prefix: true, base: record.uri })})`);

  if (categoryLinks.length > 0) {
    content.push('### Documentation & guidelines');
    categoryLinks.forEach(link => content.push(`   - ${link}`));
  }

  const mainContent = {
    uri: record.uri,
    mimeType: 'text/markdown',
    text: formatSummaryFullContent(stringJoin.newline(...content), {
      url: record.uri,
      detailType: detail,
      frontMatter: { resource: record.uri, name: record.name, version: record.version }
    })
  };

  if (detail === 'summary') {
    return { contents: [mainContent] };
  }

  // Include full JSON schemas for technical specs
  return {
    contents: [
      mainContent,
      {
        uri: `${record.uri}?detail=full`,
        mimeType: 'application/json',
        text: JSON.stringify(schema, null, 2)
      }
    ]
  };
  */
};

/**
 * Basic handler for records.
 *
 * @param params
 * @param params.record - Record for loading documentation.
 * @param params.detail - Detail level for documentation.
 * @param params.passedUri - URI of the resource.
 */
const resourceRecord = async ({
  record,
  detail,
  passedUri
}: { record: ContextManagementPatternFlyIdRecord; detail: 'summary' | 'full'; passedUri: URL }) => {
  if (!record.path) {
    return [];
  }

  const docs = [];

  try {
    const processedDocs = await processDocsFunction.memo([{
      doc: record.path,
      uri: record.uri,
      displayName: record.displayName,
      version: record.version
    }]);

    // Failures are `log.debugged` in `processDocsFunction`.
    for (const response of processedDocs) {
      if (response.isSuccess) {
        docs.push({
          ...response
        });
      }
    }
  } catch {}

  return docs.map(({ uri, path, content, displayName: name, version }) => ({
    uri: passedUri,
    mimeType: 'text/markdown',
    text: formatSummaryFullContent(content, {
      url: uri,
      detailType: detail,
      frontMatter: {
        resource: path,
        name,
        version
      }
    })
  }));
};

/**
 * Component handler for records.
 *
 * @param params
 * @param params.record - Record for loading documentation.
 * @param params.detail - Detail level for documentation.
 * @param params.passedUri - URI of the resource.
 */
const resourceComponentRecord = async ({
  record,
  detail,
  passedUri
}: { record: ContextManagementPatternFlyIdRecord; detail: 'summary' | 'full'; passedUri: URL }) => {
  const capabilities = record.lookup();

  if (!capabilities.isComponent) {
    return [];
  }

  // Handle components without available schemas
  if (!record.path && !capabilities.isSchemasAvailable) {
    return [{
      uri: record.uri,
      mimeType: CONFIG.mimeType,
      text: stringJoin.newline(
        `# ${record.displayName} (Technical specifications unavailable)`,
        '',
        `Technical specifications and JSON schemas are not available for **${record.displayName}**.`
      )
    }];
  }

  // Peer discovery for related documentation facets
  const allRecordsMap = await filterPatternFlyContext.memo({ name: record.name, version: record.version });
  const allRecords = Array.from(allRecordsMap.values());

  const schema = await getPatternFlyComponentSchema.memo(record.name);
  const properties = schema?.properties || {};
  const propNames = Object.keys(properties).join(', ') || 'None';

  const content = [
    `# ${record.displayName} (Technical ${detail === 'summary' ? 'overview' : 'specifications'})`,
    `- **Version:** ${record.version}`,
    `- **Available Props:** ${propNames}`,
    ''
  ];

  // Generate cross-links to Design, Accessibility, and writing guidelines
  const seriesUri = record.lookup(record.seriesId).uri;
  const categories = new Set(allRecords.map(record => record.displayCategory));
  const categoryReferences = Array.from(categories).sort()
    .map(category => (seriesUri && `[${category}](${seriesUri})`) || category);

  if (categoryReferences.length > 0) {
    content.push('### Documentation & guidelines');
    categoryReferences.forEach(ref => content.push(`   - ${ref}`));
  }

  const mainContent = {
    uri: passedUri,
    mimeType: CONFIG.mimeType,
    text: formatSummaryFullContent(stringJoin.newline(...content), {
      url: record.uri,
      detailType: detail,
      frontMatter: {
        resource: record.uri,
        name: record.displayName,
        version: record.version
      }
    })
  };

  if (detail === 'summary') {
    return [mainContent];
  }

  // Include the full JSON schema for deep technical analysis
  return [
    mainContent,
    {
      uri: passedUri,
      // uri: `${record.uri}${buildSearchString({ detail: 'full' }, { prefix: true, base: record.uri })}`,
      mimeType: 'application/json',
      text: JSON.stringify(schema, null, 2)
    }
  ];
};

/**
 * Unified resource callback for PatternFly records.
 *
 * @param passedUri
 * @param variables
 * @param options
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { detail = 'full', id } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['summary', 'full']) || detail) as 'summary' | 'full';

  assertInputStringShaHex(id, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'id'
  });

  const { idIndex } = await getPatternFlyContextManagementResources.memo();
  const record = idIndex.get(id);

  assertInput(
    record?.recordType === 'record',
    () => `No record found for "${id}". Try using a different ID.`
  );

  const [recordResponse, componentResponse] = await Promise.all([
    resourceRecord({ record, detail: normalizedDetail, passedUri }),
    resourceComponentRecord({ record, detail: normalizedDetail, passedUri })
  ]);

  const contents = [...recordResponse, ...componentResponse];

  assertInput(contents.length > 0, `"${record.id}" was found, but no content is currently available.`);

  return {
    contents
  };
};

/**
 * Memoized version of resourceCallback.
 */
resourceCallback.memo = memo(resourceCallback, DEFAULT_OPTIONS.toolMemoOptions.mcpResources);

/**
 * Unified resource creator for PatternFly records.
 *
 * @param options
 */
const patternFlyRecordsResource = (options = getOptions()): McpResource => {
  const list: ListResourcesCallback = async (...args) => runWithOptions(options, async () => listResources.memo(...args));
  const complete: { [callback: string]: McpResourceMetadataComplete } = {
    detail: async (...args) => runWithOptions(options, async () => uriDetailComplete.memo(...args))
  };
  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback.memo(uri, variables, options));

  return [
    NAME,
    new ResourceTemplate(URI_TEMPLATE, { list, complete }),
    CONFIG,
    callback,
    {
      complete,
      registerAllSearchCombinations: true,
      metaConfig: {
        uri: 'patternfly://records/meta{?detail}',
        title: `${CONFIG.title} Metadata`,
        description: 'Discover available parameters for unified PatternFly records.'
      }
    },
    {
      shouldRegister: opts => opts.contextManagement === true
    }
  ];
};

export {
  patternFlyRecordsResource,
  listResources,
  resourceCallback,
  resourceRecord,
  resourceComponentRecord,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

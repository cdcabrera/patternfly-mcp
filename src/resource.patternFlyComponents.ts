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
  assertInputStringLength
} from './server.assertions';
import { findClosest } from './server.search';
import { getOptions, runWithOptions } from './options.context';
import {
  getPatternFlyComponentSchema,
  getPatternFlyContextManagementResources,
  type ContextManagementPatternFlyHashRecord
} from './patternFly.getResources';
import {
  filterPatternFlyContext
} from './patternFly.search';
import {
  formatSummaryFullContent,
  nextCursor
} from './resource.helpers';
import { uriDetailComplete } from './resource.patternFlyCollections';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-components';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://components/{id}{?detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly ID and detail. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Components Index',
  description: `A list of all PatternFly components available for documentation retrieval. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown',
  annotations: {
    priority: 0.8,
    audience: ['assistant' as const]
  }
};

/**
 * List resources callback for the URI template.
 *
 * @param _extra
 * @param cursor
 * @note We use "byVersionComponentNames" instead of "byVersion" because it's specific to components.
 * Docs resources don't necessarily contain all components.
 *
 * @returns The list of available resources.
 */
const listResources = async (_extra: unknown, cursor?: string | undefined) => {
  const pageSize = 15;
  const { versionIndex } = await getPatternFlyContextManagementResources.memo();
  const terminalComponents = versionIndex.filter(entry => !entry.isCollection && entry.componentUri !== undefined);
  const { start, end, next } = nextCursor({ cursor, pageSize, size: terminalComponents.length });
  const resources: McpResourceListResult[] = [];

  terminalComponents.slice(start, end).forEach((entry, index) => {
    const actualIndex = start + index + 1;

    resources.push({
      uri: entry.componentUri as string,
      name: `${entry.displayName} (${actualIndex}/${terminalComponents.length})`,
      description: entry.description,
      mimeType: 'text/markdown'
    });
  });

  return {
    totalCount: terminalComponents.length,
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
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Options for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { detail = 'summary', id } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['summary', 'full']) || detail) as 'summary' | 'full';

  assertInputStringLength(id, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'id'
  });

  const records = await filterPatternFlyContext.memo({
    id: id as string
  });
  const record = records.get(id as string);

  assertInput(
    record !== undefined && !record.isCollection,
    () => {
      let suggestionMessage = '';

      if (id) {
        if (record?.isCollection) {
          suggestionMessage = ` "${id}" is a collection hub, not a specific component technical overview. Try accessing it via patternfly://collections/${id}.`;
        } else {
          suggestionMessage = ' Try using a different ID.';
        }
      }

      return `No component found for "${id}".${suggestionMessage}`;
    }
  );
  const allRecordsMap = await filterPatternFlyContext.memo({ name: record.name, version: record.version });
  const allRecords = Array.from(allRecordsMap.values());

  assertInput(allRecords.length > 0, `No component resource found for "${id}".`);

  /**
   * Get the JSON schema for the component.
   *
   * @param componentName - Name of the component.
   * @returns The JSON schema for the component.
   */
  const getSchema = async (componentName: string) => {
    const schema = await getPatternFlyComponentSchema.memo(componentName);

    assertInput(
      schema !== undefined,
      () => `No component schema found for "${passedUri?.toString()}".`
    );

    return schema;
  };

  /**
   * Get the JSON schema properties for the component.
   *
   * @param name - Name of the component.
   * @returns The JSON schema properties.
   */
  const getProps = async (name: string) => {
    const { title, properties } = await getSchema(name);

    return { title, properties, isProps: Object.entries(properties).length > 0 };
  };

  /**
   * Get a summary of the component.
   *
   * @param allRecords - All related context records.
   * @param currentRecord - The current context management record.
   * @returns The summary response object for the component.
   */
  const getOverview = async (allRecords: ContextManagementPatternFlyHashRecord[], currentRecord: ContextManagementPatternFlyHashRecord) => {
    const { properties } = currentRecord.isSchemasAvailable ? await getProps(currentRecord.name) : { properties: {} };
    const propNames = Object.keys(properties).join(', ') || 'None';

    const version = currentRecord.version || 'unknown';
    const uriId = currentRecord.uri;
    const uriComponentId = currentRecord.componentUri;

    // Cross-links to docs
    const categories = new Set(allRecords.map(record => record.displayCategory));
    const categoryLinks = Array.from(categories).sort()
      .map(category => `[${category}](${uriId}${buildSearchString({ category }, { prefix: true, base: uriComponentId })})`);

    const docsContent = categoryLinks.length
      ? stringJoin.newline(
        '',
        '### Documentation & guidelines',
        ...categoryLinks.map(category => `   - ${category}`)
      )
      : '';

    const content = stringJoin.newline(
      `# ${currentRecord.name} (Technical overview)`,
      `- **Version:** ${version}`,
      `- **Available Props:** ${propNames}`,
      docsContent
    );

    return {
      uri: uriComponentId || passedUri.toString(),
      mimeType: 'text/markdown',
      text: formatSummaryFullContent(content, {
        descLinkSummary: 'View summary technical specs',
        descLinkFull: 'View full technical specs',
        url: currentRecord.isSchemasAvailable ? uriComponentId : undefined,
        detailType: normalizedDetail,
        frontMatter: {
          document: uriComponentId || passedUri.toString(),
          name: currentRecord.name,
          version
        },
        summaryLength: 500
      })
    };
  };

  if (!record.isSchemasAvailable) {
    return {
      contents: [{
        uri: passedUri.toString(),
        mimeType: 'text/markdown',
        text: stringJoin.newline(
          `# ${record.name} (Technical specifications unavailable)`,
          '',
          `Technical specifications and JSON schemas are not available for **${record.name}**.`,
          '',
          `You can find general documentation for this item at: patternfly://docs/${record.id}`
        )
      }]
    };
  }

  const markdownOverview = await getOverview(allRecords, record);

  if (normalizedDetail === 'summary') {
    return {
      contents: [markdownOverview]
    };
  }

  const updatedSchemas = [];

  if (record.isSchemasAvailable) {
    const schema = await getSchema(record.name);
    const props = await getProps(record.name);
    const uri = `${markdownOverview.uri}${buildSearchString({ detail: 'full' }, { prefix: true, base: markdownOverview.uri })}`;

    if (props.isProps) {
      updatedSchemas.push({
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(schema?.properties, null, 2)
      });
    }

    updatedSchemas.push({
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(schema, null, 2)
    });
  }

  return {
    contents: [
      markdownOverview,
      ...updatedSchemas
    ]
  };
};

/**
 * Memoized version of resourceCallback.
 */
resourceCallback.memo = memo(resourceCallback, DEFAULT_OPTIONS.toolMemoOptions.mcpResources);

/**
 * Resource creator for components and metadata resources.
 *
 * @note The `metaConfig` determines if a metadata resource is generated. Remove
 * the config to disable it.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyComponentsResource = (options = getOptions()): McpResource => {
  const list: ListResourcesCallback = async (...args) => runWithOptions(options, async () => listResources.memo(...args));

  const complete: { [callback: string]: McpResourceMetadataComplete } = {
    detail: async (...args) => runWithOptions(options, async () => uriDetailComplete.memo(...args))
  };

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback.memo(uri, variables, options));

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
        uri: 'patternfly://components/meta{?detail}',
        title: `${CONFIG.title} Metadata`,
        description: 'Discover available parameters for PatternFly component ID-based resources.'
      }
    },
    {
      shouldRegister: opts => opts.contextManagement === true
    }
  ];
};

export {
  patternFlyComponentsResource,
  listResources,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

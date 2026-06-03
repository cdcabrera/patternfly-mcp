import {
  ResourceTemplate,
  type ListResourcesCallback,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './mcpSdk';
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
  getPatternFlyMcpResources,
  getPatternFlyContextManagementResources,
  type ContextManagementPatternFlyHashRecord
} from './patternFly.getResources';
import {
  filterPatternFlyContext,
  type FilterPatternFlyResultsResource
} from './patternFly.search';
import {
  type PatternFlyListResourceResult,
  type ExtendedCompleteResourceTemplateCallback
} from './resource.patternFlyDocsIndex';
import {
  formatSummaryFullContent,
  nextCursor
} from './resource.helpers';

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
    priority: 0.9,
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
 * @returns {Promise<PatternFlyListResourceResult>} The list of available resources.
 */
const listResources = async (_extra: unknown, cursor?: string | undefined) => {
  const pageSize = 15;
  const { versionIndex } = await getPatternFlyContextManagementResources.memo();
  const { start, end, next } = nextCursor({ cursor, pageSize, size: versionIndex.length });
  const resources: PatternFlyListResourceResult[] = [];

  versionIndex
    .filter(entry => entry.componentUri !== undefined)
    .slice(start, end).forEach((entry, index) => {
      const actualIndex = start + index + 1;

      resources.push({
        uri: entry.componentUri as string,
        name: `${entry.displayName} - ${entry.isSchemasAvailable ? 'Technical Specs' : 'Technical Overview'} (${entry.version}) (${actualIndex}/${versionIndex.length} components)`,
        description: entry.description,
        mimeType: 'text/markdown'
      });
    });

  return {
    totalCount: versionIndex.length,
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
 * Detail completion callback for the URI template.
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
 * ID completion callback for the URI template.
 *
 * @param id - The value to complete.
 * @param _context - The completion context.
 * @returns The list of available IDs.
 */
const uriIdComplete: ExtendedCompleteResourceTemplateCallback = async (id: string, _context) => {
  const { contextManagementHashIndex } = await getPatternFlyMcpResources.memo();
  const suggestions = Array.from(contextManagementHashIndex.entries())
    .filter(([hash, record]) =>
      hash.includes(id.toLowerCase()) ||
      record.name.toLowerCase().includes(id.toLowerCase()) ||
      record.displayName.toLowerCase().includes(id.toLowerCase()))
    .map(([hash]) => hash);

  return suggestions;
};

/**
 * Memoized version of uriIdComplete.
 */
uriIdComplete.memo = memo(uriIdComplete);

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
  const section = 'components';

  assertInputStringLength(id, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'id'
  });

  const records = await filterPatternFlyContext.memo({
    id: id as string,
    section
  });
  const byEntry = Array.from(records.values());

  assertInput(
    byEntry.length > 0,
    () => {
      let suggestionMessage = '';

      if (id) {
        suggestionMessage = ' Try using a different ID.';
      }

      return `No component found for "${id}".${suggestionMessage}`;
    }
  );

  const record = byEntry[0] as ContextManagementPatternFlyHashRecord;
  const { resources } = await getPatternFlyMcpResources.memo();
  const resource = resources.get(record.name);

  assertInput(resource !== undefined, `No component resource found for "${id}".`);

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
   * @param res - The resource object.
   * @param currentRecord - The current context management record.
   * @returns The summary response object for the component.
   */
  const getOverview = async (res: FilterPatternFlyResultsResource, currentRecord: ContextManagementPatternFlyHashRecord) => {
    const { properties } = currentRecord.isSchemasAvailable ? await getProps(currentRecord.name) : { properties: {} };
    const propNames = Object.keys(properties).join(', ') || 'None';

    const version = currentRecord.version || 'unknown';
    const uriId = currentRecord.uri;
    const uriComponentId = currentRecord.componentUri;

    // Cross-links to docs
    const categories = new Set(res.entries.map(entry => entry.displayCategory));
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

    const canonicalUri = uriComponentId || uriId || passedUri.toString();

    return {
      uri: canonicalUri,
      mimeType: 'text/markdown',
      text: formatSummaryFullContent(content, {
        descLinkSummary: 'View summary technical specs',
        descLinkFull: 'View full technical specs',
        url: currentRecord.isSchemasAvailable ? uriComponentId || uriId : undefined,
        detailType: normalizedDetail,
        frontMatter: {
          document: uriComponentId || uriId,
          name: currentRecord.name,
          version
        },
        summaryLength: 500
      })
    };
  };

  const markdownOverview = await getOverview(resource as FilterPatternFlyResultsResource, record);

  if (normalizedDetail === 'summary') {
    return {
      contents: [markdownOverview]
    };
  }

  const updatedSchemas = [];

  if (resource.isSchemasAvailable) {
    const schema = await getSchema(resource.name);
    const props = await getProps(resource.name);
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

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    id: async (...args) => runWithOptions(options, async () => uriIdComplete.memo(...args)),
    detail: async (...args) => runWithOptions(options, async () => uriDetailComplete.memo(...args))
  };

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback(uri, variables, options));

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
      indexConfig: {
        uri: 'patternfly://components/index{?version}'
      },
      metaConfig: {
        uri: 'patternfly://components/meta{?version}',
        title: `${CONFIG.title} Metadata`,
        description: 'Use these parameters to filter the PatternFly component index.'
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
  uriDetailComplete,
  uriIdComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

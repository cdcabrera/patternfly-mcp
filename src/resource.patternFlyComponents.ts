import {
  ResourceTemplate,
  type ListResourcesCallback,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './mcpSdk';
import { memo } from './server.caching';
import { buildSearchString, isShaHexLike, stringJoin } from './server.helpers';
import {
  assertInput,
  assertInputStringLength,
  assertInputStringShaHex
} from './server.assertions';
import { findClosest } from './server.search';
import { getOptions, runWithOptions } from './options.context';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources
} from './patternFly.getResources';
import {
  filterPatternFly,
  type FilterPatternFlyResultsResource
} from './patternFly.search';
import {
  type PatternFlyListResourceResult,
  type ExtendedCompleteResourceTemplateCallback
} from './resource.patternFlyDocsIndex';
import {
  formatSummaryFullContent,
  nextCursor,
  paramCompletion
} from './resource.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-components';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://components/{name}{?id,detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly name, ID, or detail. ${URI_TEMPLATE}`;

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
  const { versionIndex } = await getPatternFlyMcpResources.memo();
  const { start, end, next } = nextCursor({ cursor, pageSize, size: versionIndex.length });
  const resources: PatternFlyListResourceResult[] = [];

  versionIndex
    .filter(entry => entry.uriComponentId !== undefined)
    .slice(start, end).forEach((entry, index) => {
      const actualIndex = start + index + 1;

      resources.push({
        uri: entry.uriComponentId as string,
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
 * Name completion callback for the URI template.
 *
 * @param name - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available names, or an empty list.
 */
const uriNameComplete: ExtendedCompleteResourceTemplateCallback = async (name: string, context) => {
  const { id } = context?.arguments || {};

  if (isShaHexLike(id)) {
    return [];
  }

  const section = 'components';
  const { names } = await paramCompletion({ name, section, id });

  return names;
};

/**
 * Memoized version of uriNameComplete.
 */
uriNameComplete.memo = memo(uriNameComplete);

/**
 * ID completion callback for the URI template.
 *
 * @param id - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available IDs, or an empty list.
 */
const uriIdComplete: ExtendedCompleteResourceTemplateCallback = async (id: string, context) => {
  const { name } = context?.arguments || {};

  if (isShaHexLike(name)) {
    return [];
  }

  const section = 'components';
  const { ids } = await paramCompletion({ name, section, id });

  return ids;
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
  const { id, name, detail = 'summary' } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['summary', 'full']) || detail) as 'summary' | 'full';
  const section = 'components';
  const isNameHash = isShaHexLike(name);
  const isIdHash = isShaHexLike(id);
  const isTerminalId = isNameHash || isIdHash;
  let updatedId: string | undefined;

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

  if (id) {
    assertInputStringShaHex(id, {
      ...options.minMax.sha1Hex,
      inputDisplayName: 'id'
    });

    // Be lenient, only apply the ID if it's different from name.
    if (id !== name) {
      updatedId = id;
    }
  }

  const { availableSchemasVersions, latestVersion } = await getPatternFlyMcpResources.memo();

  if (isTerminalId) {
    updatedId = (isIdHash ? id : name) as string;
  }

  const updatedVersion = latestVersion;
  const updatedName = isTerminalId ? undefined : (name as string).trim();

  const { byResource, byEntry } = await filterPatternFly.memo({
    id: updatedId,
    version: updatedId ? undefined : latestVersion,
    name: updatedName,
    section
  });

  assertInput(
    byEntry.length > 0,
    () => {
      let suggestionMessage = '';

      if (id) {
        suggestionMessage = ' Try using a different ID.';
      }

      return `No component found for "${updatedName || updatedId}".${suggestionMessage}`;
    }
  );

  const resource = byEntry.length > 0 ? byResource.get(byEntry[0]!.name) : undefined;

  assertInput(resource !== undefined, `No component resource found for "${updatedName || updatedId}".`);

  /**
   * Get the JSON schema for the component.
   *
   * @param name - Name of the component.
   * @returns The JSON schema for the component.
   */
  const getSchema = async (name: string) => {
    const schema = await getPatternFlyComponentSchema.memo(name);

    assertInput(
      schema !== undefined,
      () => {
        let suggestionMessage = '';

        if (updatedVersion && !availableSchemasVersions.includes(updatedVersion)) {
          suggestionMessage = ` Component schemas are only available for PatternFly versions ${availableSchemasVersions.join(', ')}`;
        }

        return `No component schema found for "${passedUri?.toString()}".${suggestionMessage}`;
      }
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
   * @returns The summary response object for the component.
   */
  const getOverview = async (res: FilterPatternFlyResultsResource) => {
    const { properties } = res.isSchemasAvailable ? await getProps(res.name) : { properties: {} };
    const propNames = Object.keys(properties).join(', ') || 'None';

    const firstEntry = res.entries[0];
    const uriId = res.uriId || firstEntry?.uriId;
    const uriComponentId = res.uriComponentId || firstEntry?.uriComponentId;

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
      `# ${res.name} (Technical overview)`,
      `- **Version:** ${updatedVersion}`,
      `- **Available Props:** ${propNames}`,
      docsContent
    );

    const canonicalUri = uriComponentId || uriId || res.uriHash || passedUri.toString();

    return {
      uri: canonicalUri,
      mimeType: 'text/markdown',
      text: formatSummaryFullContent(content, {
        descLinkSummary: 'View summary technical specs',
        descLinkFull: 'View full technical specs',
        url: res.isSchemasAvailable ? uriComponentId || uriId : undefined,
        detailType: normalizedDetail,
        frontMatter: {
          document: uriComponentId || uriId,
          name: res.name,
          version: updatedVersion
        },
        summaryLength: 500
      })
    };
  };

  const markdownOverview = await getOverview(resource as FilterPatternFlyResultsResource);

  if (normalizedDetail === 'summary') {
    return {
      contents: [markdownOverview]
    };
  }

  const updatedSchemas = [];

  if (resource.isSchemasAvailable) {
    const schema = await getSchema(name);
    const props = await getProps(name);
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
    name: async (...args) => runWithOptions(options, async () => uriNameComplete.memo(...args)),
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
      registerAllSearchCombinations: true,
      metaConfig: {
        uri: 'patternfly://components/meta{?version}',
        title: `${CONFIG.title} Metadata`,
        description: 'Use these parameters to filter the list of PatternFly components.'
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
  uriDetailComplete,
  uriIdComplete,
  uriNameComplete,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

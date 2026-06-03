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
  assertInputStringLength
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
const URI_TEMPLATE = 'patternfly://components/{nameOrId}{?version,detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly name, ID, version, or detail. ${URI_TEMPLATE}`;

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
    .filter(entry => entry.uriComponentHash !== undefined)
    .slice(start, end).forEach((entry, index) => {
      const actualIndex = start + index + 1;

      resources.push({
        uri: entry.uriComponentHash as string,
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
 * Name or ID completion callback for the URI template.
 *
 * @param nameOrId - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available names, or an empty list.
 */
const uriNameOrIdComplete: ExtendedCompleteResourceTemplateCallback = async (nameOrId: string, context) => {
  const { version } = context?.arguments || {};

  if (isShaHexLike(nameOrId)) {
    return [];
  }

  const section = 'components';
  const { names, ids } = await paramCompletion({ name: nameOrId, section, version });

  return [...names, ...ids];
};

/**
 * Memoized version of uriNameOrIdComplete.
 */
uriNameOrIdComplete.memo = memo(uriNameOrIdComplete);

/**
 * Version completion callback for the URI template.
 *
 * @param version - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available versions, or an empty list.
 */
const uriVersionComplete: ExtendedCompleteResourceTemplateCallback = async (version: string, context) => {
  const { nameOrId } = context?.arguments || {};

  if (isShaHexLike(nameOrId)) {
    return [];
  }

  const section = 'components';
  const { versions } = await paramCompletion({ name: nameOrId, section, version });

  return versions;
};

/**
 * Memoized version of uriVersionComplete.
 */
uriVersionComplete.memo = memo(uriVersionComplete);

/**
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Options for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { detail = 'summary', nameOrId, version } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['summary', 'full']) || detail) as 'summary' | 'full';
  const section = 'components';
  const isTerminalId = isShaHexLike(nameOrId);
  let updatedId: string | undefined;
  let updatedName: string | undefined;

  assertInputStringLength(nameOrId, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'nameOrId'
  });

  if (isTerminalId) {
    updatedId = nameOrId as string;
  } else {
    updatedName = (nameOrId as string).trim();
  }

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'version'
    });
  }

  const { latestVersion, availableSchemasVersions } = await getPatternFlyMcpResources.memo();

  const updatedVersion = isTerminalId ? undefined : version || latestVersion;

  const { byResource, byEntry } = await filterPatternFly.memo({
    id: updatedId,
    version: updatedVersion,
    name: updatedName,
    section
  });

  const name = (updatedId || updatedName) as string;

  assertInput(updatedId !== undefined || updatedName !== undefined, 'A name or ID must be provided.');

  assertInput(
    byEntry.length > 0,
    () => {
      let suggestionMessage = '';

      if (updatedId) {
        suggestionMessage = ' Try using a different ID.';
      }

      return `No component found for "${name}".${suggestionMessage}`;
    }
  );

  const resource = byEntry.length > 0 ? byResource.get(byEntry[0]!.name) : undefined;

  assertInput(resource !== undefined, `No component resource found for "${name}".`);

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
    const schema = await getSchema(name as string);
    const props = await getProps(name as string);
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
    nameOrId: async (...args) => runWithOptions(options, async () => uriNameOrIdComplete.memo(...args)),
    version: async (...args) => runWithOptions(options, async () => uriVersionComplete.memo(...args)),
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
  uriVersionComplete,
  uriNameOrIdComplete,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

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
  assertInputStringLength,
  assertInputStringShaHex
} from './server.assertions';
import { findClosest } from './server.search';
import { getOptions, runWithOptions } from './options.context';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources
} from './patternFly.getResources';
import { filterPatternFly } from './patternFly.search';
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
const NAME = 'patternfly-components-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://components/{name}{?id,version,category,detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version and category. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Components Index',
  description: `A list of all PatternFly component names available for documentation retrieval. ${URI_DESCRIPTION}`,
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
  const { versionIndex } = await getPatternFlyMcpResources.memo();
  const { start, end, next } = nextCursor({ cursor, pageSize: 50, size: versionIndex.length });
  const resources: PatternFlyListResourceResult[] = [];

  versionIndex.slice(start, end).forEach((entry, _index) => {
    if (entry.section === 'components' && entry.isSchemasAvailable) {
      resources.push({
        uri: entry.uriId,
        name: `${entry.displayName} - ${entry.displayCategory} (${entry.version})`,
        description: entry.description,
        mimeType: 'text/markdown'
      });
    }
  });

  /* This should be generated.
      {
        uri: 'patternfly://components/index',
        mimeType: 'text/markdown',
        name: 'Component Index',
        description: `Component index for PatternFly. Showing ${start + 1}-${end + 1} of ${versionIndex.length} results. ${URI_DESCRIPTION}`
      },*/

  return {
    nextCursor: next,
    resources
  };

  /*
  const { availableVersions, byVersionComponentNames } = await getPatternFlyMcpResources.memo();
  const resources: PatternFlyListResourceResult[] = [];

  Array.from(byVersionComponentNames)
    .filter(([version]) => availableVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version]) => {
      resources.push({
        uri: `patternfly://components/index?version=${encodeURIComponent(version)}`,
        mimeType: 'text/markdown',
        name: `Component Index (${version})`,
        description: `Component documentation entry point for PatternFly version ${version}. ${URI_DESCRIPTION}`
      });
    });

  return {
    resources: [
      {
        uri: 'patternfly://components/index',
        mimeType: 'text/markdown',
        name: 'Components Index (Latest)',
        description: `Component documentation entry point for the latest PatternFly version. This is the recommended starting point. ${URI_DESCRIPTION}`
      },
      ...resources.sort((a, b) => a.name.localeCompare(b.name))
    ]
  };
  */
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
  // const levels = ['summary', 'full', 'schema', 'props', 'examples'];
  const levels = ['summary', 'full'];
  const closest = findClosest.memo(detail, levels) as string | undefined;

  return closest ? [closest] : [];
};

/**
 * Memoized version of uriDetailComplete.
 */
uriDetailComplete.memo = memo(uriDetailComplete);

/**
 * Category completion callback for the URI template.
 *
 * @param category - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available categories, or an empty list.
 */
const uriCategoryComplete: ExtendedCompleteResourceTemplateCallback = async (category: string, context) => {
  const { version, name } = context?.arguments || {};
  const section = 'components';
  const { categories } = await paramCompletion({ category, name, section, version });

  return categories;
};

/**
 * Memoized version of uriCategoryComplete.
 */
uriCategoryComplete.memo = memo(uriCategoryComplete);

/**
 * Version completion callback for the URI template.
 *
 * @param version - The value to complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available versions, or an empty list.
 */
const uriVersionComplete: ExtendedCompleteResourceTemplateCallback = async (version: string, context) => {
  const { category, name } = context?.arguments || {};
  const section = 'components';
  const { versions } = await paramCompletion({ category, name, section, version });

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
  const { version, category, id, name, detail = 'summary' } = variables || {};
  // category provides "react" = examples, design, etc...
  // const normalizedDetail = (findClosest.memo(detail, ['summary', 'full', 'schema', 'props', 'examples']) || detail) as 'full' | 'summary' | 'schema' | 'props' | 'examples';
  const normalizedDetail = (findClosest.memo(detail, ['summary', 'full', 'schema', 'props']) || detail) as 'full' | 'summary' | 'schema' | 'props';
  const section = 'components';
  let updatedId;

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

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'version'
    });
  }

  if (category) {
    assertInputStringLength(category, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'category'
    });
  }

  const { availableVersions, availableSchemasVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestVersion;
  const updatedName = name.trim();

  const { byResource, byEntry } = await filterPatternFly.memo({
    id: updatedId,
    version: updatedVersion,
    name: updatedName,
    category,
    section
  });

  assertInput(
    byResource.get(name) !== undefined,
    () => {
      let suggestionMessage = '';

      if (id || version || category || section) {
        const variableList = [
          (version && 'id') || undefined,
          (version && 'version') || undefined,
          (category && 'category') || undefined
        ].filter(Boolean).join(', ');

        suggestionMessage = ` Try using different parameters for ${variableList}.`;
      }

      return `No component found for "${updatedName}".${suggestionMessage}`;
    }
  );

  const getSchema = async (name: string) => {
    const schema = await getPatternFlyComponentSchema.memo(name);

    assertInput(
      schema !== undefined,
      () => {
        let suggestionMessage = '';

        if (!availableSchemasVersions.includes(updatedVersion)) {
          suggestionMessage = ` Component schemas are only available for PatternFly versions ${availableSchemasVersions.join(', ')}`;
        }

        return `No component found for "${passedUri?.toString()}".${suggestionMessage}`;
      }
    );

    return schema;
  };

  const getProps = async (name: string) => {
    const { title, properties } = await getSchema(name);

    return { title, properties, isProps: Object.entries(properties).length > 0 };
  };

  const getSummary = async (resource) => {
    //id: updatedId,
    //     version: updatedVersion,
    //     name: updatedName,
    //     category,
    //     section
    // const { categories } = await paramCompletion({ category, name: updatedName, section, version: updatedVersion });
    const categories = new Set(resource.entries.map(entry => entry.displayCategory));
    const categoryList = Array
      .from(categories)
      .sort()
      .map(category =>
        `[${category}](${resource.uriComponentId}${buildSearchString({ category }, { prefix: true, base: resource.uriComponentId })})`);
    // const categories = new Set(resource.entries.map(entry => entry.displayCategory));

    // Should have cross links to other entries under docs? // could just show props on summary?

    const { isProps, ...props } = await getProps(name);
    let updatedProps;

    if (isProps) {
      updatedProps = stringJoin.newline(
        '**Props metadata**',
        '',
        `Title: ${props.title}`,
        `Properties:`,
        '```json',
        // JSON.stringify([Object.entries(props.properties).sort(([a], [b]) => a.localeCompare(b))], null, 2),
        JSON.stringify(props.properties, null, 2),
        '',
        '```'
      );
    }

    const content = stringJoin.newlineFiltered(
      `Component "${updatedName}",${(resource.isSchemasAvailable && ' JSON Schema is available.') || ' JSON Schema not available.'}`,
      (categoryList.length && 'Information available for:') || '',
      ...categoryList,
      updatedProps
      // resource.isSchemasAvailable ? `[Props JSON Schema](${resource.uriComponentId}${buildSearchString({ category }, { prefix: true, base: resource.uriComponentId })})` : '',
      // resource.isSchemasAvailable ? `[Full JSON Schema](${resource.uriComponentId}${buildSearchString({ category }, { prefix: true, base: resource.uriComponentId })})` : ''
    );

    return [
      {
        uri: resource.uriComponentId,
        mimeType: 'text/markdown',
        text: formatSummaryFullContent(content, {
          descLinkSummary: 'Props JSON Schema',
          descLinkFull: 'Full JSON Schema',
          url: resource.isSchemasAvailable ? resource.uriComponentId : undefined,
          detailType: normalizedDetail,
          frontMatter: {
            document: resource.uriComponentId,
            name: updatedName,
            version: updatedVersion
          }
        })
      }
    ];
  };

  const getFull = async (resource) => {
    const schema = await getSchema(name);
    const summary = await getSummary(resource);

    return [
      ...summary,
      {
        uri: resource.uriSchema,
        mimeType: 'application/json',
        text: JSON.stringify(schema, null, 2)
      }
    ];
  };
  // CATEGORY SHOULD ACTUALLY BE THE FILTER DRIVER OF HELPING WHAT SHOWS... DESIGN, EXAMPLES. DETAIL SHOULD REMAIN AS 2 VALUES.
  // full returns an entry for schema, props, AND examples, AND doc
  // summary returns a brief summary of the component with a list of available links to the other entries
  // schema returns the JSON schema for the component
  // props returns the JSON schema properties for the component

  /*
  const detailLevel = async ({ name }) => {
    switch (normalizedDetail) {
      case 'schema':
        const schema = await getSchema(name);

        return {
          mimeType: 'application/json',
          text: JSON.stringify(schema, null, 2)
        };
      case 'props':
        const props = await getProps(name);

        return {
          mimeType: 'application/json',
          text: JSON.stringify(props, null, 2)
        };
      case 'full':
        break;
      case 'summary':
      default:
        break;
    }
  };
  */

  return {
    contents: []
  };

  /*
  const docsIndex = Array.from(byResource.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((resource, index) =>
    // const searchString = buildSearchString({ category }, { prefix: true, base: resource.uri });

    // return `${index + 1}. [${resource.name} (${updatedVersion})](${resource.uri}${searchString || ''})`;

      ({
        uri,
        mimeType: 'text/markdown',
        ...detailLevel()
      }));

  return {
    contents: [{
      uri: passedUri?.toString(),
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Components Index for "${updatedVersion}"`,
        '',
        '',
        ...docsIndex || []
      )
    }]
  };

   */
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
    detail: async (...args) => runWithOptions(options, async () => uriDetailComplete.memo(...args)),
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    version: async (...args) => runWithOptions(options, async () => uriVersionComplete.memo(...args))
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
  resourceCallback,
  uriCategoryComplete,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

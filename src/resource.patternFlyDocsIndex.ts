import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './mcpSdk';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { resolvePatternFlyIndex, paramCompletion } from './resource.helpers';

/**
 * Extended callback type that combines the `CompleteResourceTemplateCallback` type
 * and an additional `memo` property.
 *
 * @extends CompleteResourceTemplateCallback
 */
type ExtendedCompleteResourceTemplateCallback = { memo: CompleteResourceTemplateCallback } & CompleteResourceTemplateCallback;

/**
 * List resources result type.
 *
 * @note This is temporary until MCP SDK exports ListResourcesResult.
 *
 * @property uri - The fully qualified URI of the resource.
 * @property name - A human-readable name for the resource.
 * @property [mimeType] - The MIME type of the content.
 * @property [description] - A brief hint for the model.
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
const NAME = 'patternfly-docs-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/index{?version,category,section}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version, category, and section. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: `A list of PatternFly documentation links including accessibility, components, charts, development, writing, and AI guidance files. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template by available versions only.
 *
 * @note It's important to keep lists focused and concise, avoid listing all resources.
 *
 * @returns {Promise<PatternFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { availableVersions, byVersion } = await getPatternFlyMcpResources.memo();
  const resources: PatternFlyListResourceResult[] = [];

  Object.entries(byVersion)
    .filter(([version]) => availableVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version]) => {
      resources.push({
        uri: `patternfly://docs/index?version=${encodeURIComponent(version)}`,
        mimeType: 'text/markdown',
        name: `Docs Index (${version})`,
        description: `Documentation entry point for PatternFly version ${version}. ${URI_DESCRIPTION}`
      });
    });

  return {
    resources: [
      {
        uri: 'patternfly://docs/index',
        mimeType: 'text/markdown',
        name: 'Docs Index (Latest)',
        description: `Documentation entry point for the latest PatternFly version. This is the recommended starting point. ${URI_DESCRIPTION}`
      },
      ...resources.sort((a, b) => a.name.localeCompare(b.name))
    ]
  };
};

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * Name completion callback for the URI template.
 *
 * @note If version is not available, the latest version is used to refine the search results
 * since it aligns with the default behavior of the PatternFly documentation.
 *
 * @param name - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: ExtendedCompleteResourceTemplateCallback = async (name: string, context) => {
  const { version, category, section } = context?.arguments || {};
  const { names } = await paramCompletion({ category, name, section, version });

  return names;
};

/**
 * Memoized version of uriNameComplete.
 */
uriNameComplete.memo = memo(uriNameComplete);

/**
 * Category completion callback for the URI template.
 *
 * @param category - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available categories, or an empty list.
 */
const uriCategoryComplete: ExtendedCompleteResourceTemplateCallback = async (category: string, context) => {
  const { version, section, name } = context?.arguments || {};
  const { categories } = await paramCompletion({ category, name, section, version });

  return categories;
};

/**
 * Memoized version of uriCategoryComplete.
 */
uriCategoryComplete.memo = memo(uriCategoryComplete);

/**
 * Section completion callback for the URI template.
 *
 * @param section - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available sections, or an empty list.
 */
const uriSectionComplete: ExtendedCompleteResourceTemplateCallback = async (section: string, context) => {
  const { version, category, name } = context?.arguments || {};
  const { sections } = await paramCompletion({ category, name, section, version });

  return sections;
};

/**
 * Memoized version of uriSectionComplete.
 */
uriSectionComplete.memo = memo(uriSectionComplete);

/**
 * Name completion callback for the URI template.
 *
 * @param version - The value to complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available versions, or an empty list.
 */
const uriVersionComplete: ExtendedCompleteResourceTemplateCallback = async (version: string, context) => {
  const { section, category, name } = context?.arguments || {};
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
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { version, content } = await resolvePatternFlyIndex(variables as any, options);

  return {
    contents: [
      {
        uri: passedUri?.toString(),
        mimeType: 'text/markdown',
        text: stringJoin.newline(
          `# PatternFly Documentation Index for "${version}"`,
          '',
          '',
          ...content
        )
      }
    ]
  };
};

/**
 * Resource creator for the documentation index and metadata resources.
 *
 * @note The `metaConfig` determines if a metadata resource is generated. Remove
 * the config to disable it.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (options = getOptions()): McpResource => {
  const list = async () => runWithOptions(options, async () => listResources.memo());

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    section: async (...args) => runWithOptions(options, async () => uriSectionComplete.memo(...args)),
    version: async (...args) => runWithOptions(options, async () => uriVersionComplete.memo(...args))
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
      metaConfig: {
        uri: 'patternfly://docs/meta{?version}',
        title: `${CONFIG.title} Metadata`,
        description: 'Use these parameters to filter the PatternFly documentation index.'
      }
    }
  ];
};

export {
  patternFlyDocsIndexResource,
  listResources,
  resourceCallback,
  uriCategoryComplete,
  uriNameComplete,
  uriSectionComplete,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG,
  type ExtendedCompleteResourceTemplateCallback,
  type PatternFlyListResourceResult
};

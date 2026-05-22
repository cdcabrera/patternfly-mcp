import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './mcpSdk';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { assertInput } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { resolvePatternFlyIndex } from './resource.helpers';
import { type PatternFlyListResourceResult } from './resource.patternFlyDocsIndex';
import { uriCategoryComplete, uriVersionComplete } from './resource.patternFlyComponentsIndex';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-schemas-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/index{?version,category}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version and category. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schemas Index',
  description: `A list of all PatternFly component names available for JSON Schema retrieval. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template.
 *
 * @returns {Promise<PatternFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { availableSchemasVersions, byVersionComponentNames } = await getPatternFlyMcpResources.memo();
  const resources: PatternFlyListResourceResult[] = [];

  Array.from(byVersionComponentNames)
    .filter(([version]) => availableSchemasVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version]) => {
      resources.push({
        uri: `patternfly://schemas/index?version=${encodeURIComponent(version)}`,
        mimeType: 'text/markdown',
        name: `JSON Component Schemas Index (${version})`,
        description: `JSON component schemas for PatternFly version ${version}. ${URI_DESCRIPTION}`
      });
    });

  return {
    resources: [
      {
        uri: 'patternfly://schemas/index',
        mimeType: 'text/markdown',
        name: 'JSON Component Schemas Index (Latest)',
        description: `JSON component schemas entry point for the latest PatternFly version. This is the recommended starting point. ${URI_DESCRIPTION}`
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
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Options for the resource callback.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { version, available, content, count } = await resolvePatternFlyIndex({
    ...variables as any,
    resourceType: 'schemas'
  }, options);

  assertInput(count > 0, () => {
    const sug = !available.includes(version)
      ? ` Component schemas are only available for versions: ${available.join(', ')}`
      : '';

    return `No component JSON schemas found for "${passedUri?.toString()}".${sug}`;
  });

  return {
    contents: [{
      uri: passedUri?.toString(),
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Component JSON Schemas Index for "${version}"`,
        '',
        '',
        ...content
      )
    }]
  };
};

/**
 * Resource creator for the component schemas index and metadata resources.
 *
 * @note This resource is being considered for deprecation in favor of a more
 * all encompassing resource, like "resource.patternFlyComponentsIndex."
 *
 * @note The `metaConfig` determines if a metadata resource is generated. Remove
 * the config to disable it.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasIndexResource = (options = getOptions()): McpResource => {
  const list = async () => runWithOptions(options, async () => listResources.memo());

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
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
      metaConfig: {
        uri: 'patternfly://schemas/meta{?version}',
        title: `${CONFIG.title} Metadata`,
        description: 'Use these parameters to filter the list of PatternFly component schemas.'
      }
    }
  ];
};

export {
  patternFlySchemasIndexResource,
  listResources,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

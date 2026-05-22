import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './mcpSdk';
import { getOptions, runWithOptions } from './options.context';
import { resolvePatternFlyResources } from './resource.helpers';
import {
  uriCategoryComplete,
  uriNameComplete,
  uriSectionComplete,
  uriVersionComplete
} from './resource.patternFlyDocsIndex';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{name}{?version,category,section}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version, category, and section. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Page',
  description: `Retrieve specific PatternFly documentation by name or path. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown'
};

/**
 * Resource callback for the documentation template.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { docs } = await resolvePatternFlyResources(variables as any, options);

  return {
    contents: docs.map(doc => ({
      uri: passedUri?.toString(),
      mimeType: 'text/markdown',
      text: `# Documentation from ${doc.resolvedPath || doc.path}\n\n${doc.content}`
    }))
  };
};

/**
 * Resource creator for the documentation template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => {
  const list = undefined;

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    name: async (...args) => runWithOptions(options, async () => uriNameComplete.memo(...args)),
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
      registerAllSearchCombinations: true
    }
  ];
};

export {
  patternFlyDocsTemplateResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './mcpSdk';
import { memo } from './server.caching';
import { getOptions, runWithOptions } from './options.context';
import { resolvePatternFlySchema, paramCompletion } from './resource.helpers';
import { uriCategoryComplete, uriVersionComplete } from './resource.patternFlyComponentsIndex';
import { type ExtendedCompleteResourceTemplateCallback } from './resource.patternFlyDocsIndex';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-schemas-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/{name}{?version,category}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version and category. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schema',
  description: `Retrieve the JSON Schema for a specific PatternFly component by name. ${URI_DESCRIPTION}`,
  mimeType: 'application/json'
};

/**
 * Name completion callback for the URI template.
 *
 * @param name - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: ExtendedCompleteResourceTemplateCallback = async (name: string, context) => {
  const { version, category } = context?.arguments || {};
  const section = 'components';
  const { names } = await paramCompletion({ category, name, section, version });

  return names;
};

/**
 * Memoized version of uriNameComplete.
 */
uriNameComplete.memo = memo(uriNameComplete);

/**
 * Resource callback for the documentation template.
 *
 * @note We temporarily use `DEFAULT_OPTIONS` `latestSchemasVersion`
 *
 * @param passedUri - The URI of the resource.
 * @param variables - The variables of the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { schema } = await resolvePatternFlySchema(variables as any, options);

  return {
    contents: [
      {
        uri: passedUri?.toString(),
        mimeType: 'application/json',
        text: JSON.stringify(schema, null, 2)
      }
    ]
  };
};

/**
 * Resource creator for the component schemas template.
 *
 * @note This resource is being considered for deprecation in favor of a more
 * all encompassing resource, like "resource.patternFlyComponentsTemplate."
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasTemplateResource = (options = getOptions()): McpResource => {
  const list = undefined;

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    name: async (...args) => runWithOptions(options, async () => uriNameComplete.memo(...args)),
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
      complete
    }
  ];
};

export {
  patternFlySchemasTemplateResource,
  resourceCallback,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

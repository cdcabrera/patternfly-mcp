import {
  type CompleteResourceTemplateCallback,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { getOptions, runWithOptions } from './options.context';
import { filterPatternFly, searchPatternFly } from './patternFly.search';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources,
  type PatternFlyComponentSchema
} from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { listResources, uriVersionComplete } from './resource.patternFlySchemasIndex';
import { assertInput, assertInputStringLength } from './server.assertions';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-schemas-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/{version}/{name}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schema',
  description: 'Retrieve the JSON Schema for a specific PatternFly component by name',
  mimeType: 'application/json'
};

/**
 * Name completion callback for the URI template.
 *
 * @param value - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: CompleteResourceTemplateCallback = async (value: unknown, context) => {
  const { version } = context?.arguments || {};

  const normalizedValue = typeof value === 'string' ? value?.trim()?.toLowerCase() : '';
  const normalizedVersion = typeof version === 'string' ? version?.trim()?.toLowerCase() : undefined;

  const { byEntry } = await filterPatternFly.memo({
    version: normalizedVersion,
    name: normalizedValue
  });

  const names = new Set<string>();

  byEntry.forEach(result => {
    if (result.uriSchemas) {
      names.add(result.name);
    }
  });

  return Array.from(names).sort();
};

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
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { version, name } = variables || {};

  assertInputStringLength(version, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'version'
  });

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

  const { availableSchemasVersions, latestSchemasVersion } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestSchemasVersion;
  const updatedName = name.trim();

  const { byEntry } = await filterPatternFly.memo({
    version: updatedVersion,
    name: updatedName
  });

  let result: PatternFlyComponentSchema | undefined;
  const matchedSchemas: string[] = [];

  byEntry.forEach(result => {
    if (result.uriSchemas) {
      matchedSchemas.push(result.name);
    }
  });

  if (matchedSchemas[0]) {
    result = await getPatternFlyComponentSchema.memo(matchedSchemas[0]);
  }

  assertInput(
    matchedSchemas.length > 0 && result !== undefined,
    () => {
      let suggestionMessage = '';

      if (!availableSchemasVersions.includes(updatedVersion)) {
        suggestionMessage = ` Component schemas are only available for PatternFly versions ${availableSchemasVersions.join(', ')}`;
      }

      return `No component JSON schemas found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  /*
  if (matchedSchemas.length > 0) {
    for (const match of matchedSchemas) {
      const schema = await getPatternFlyComponentSchema.memo(match);

      if (schema) {
        result = schema;
        break;
      }
    }
  }
  */


  /*
  const { exactMatches, searchResults } = await searchPatternFly.memo(name, { version: updatedVersion });
  let result: PatternFlyComponentSchema | undefined;

  if (exactMatches.length > 0) {
    for (const match of exactMatches) {
      const schema = await getPatternFlyComponentSchema.memo(match.item);

      if (schema) {
        result = schema;
        break;
      }
    }
  }

  assertInput(
    result === undefined,
    () => {
      const suggestions = searchResults
        .filter(searchResult => searchResult?.versions?.[updatedVersion]?.isSchemasAvailable)
        .map(searchResult => searchResult.item).slice(0, 3);

      const suggestionMessage = suggestions.length
        ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
        : 'No similar components found.';
      const foundNotFound = exactMatches.length ? 'found but JSON schema not available.' : 'not found.';

      return `Component "${name.trim()}" ${foundNotFound} ${suggestionMessage}`;
    },
    ErrorCode.InvalidParams
  );
   */

  return {
    contents: [
      {
        uri: passedUri?.toString() || `patternfly://schemas/${updatedVersion}/${updatedName}`,
        mimeType: 'application/json',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
};

/**
 * Resource creator for the component schemas template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasTemplateResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      name: async (...args) => runWithOptions(options, async () => uriNameComplete(...args)),
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlySchemasTemplateResource,
  resourceCallback,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

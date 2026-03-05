import {
  ResourceTemplate,
  type McpServer,
  //   type ResourceMetadata,
  // type ReadResourceCallback,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';

/**
 * Register an MCP resource.
 *
 * Capable of registering specific resource variations indicated when a URI template is used,
 * making the parameterized URIs for query/search strings optional instead of required.
 *
 * What's registered:
 * - `original`: The original string or template URI which typically includes ALL parameters.
 * - `base URI`: Template base URI, sans hash, search params
 * - `incremental params URIs`: URIs that incrementally add search params
 *
 * Optional registration:
 * - `all permutations`: Disabled by default, allows creating all search parameter permutations
 *     of resources for registration.
 *
 * Why we only register this limited set of URIs:
 * - To avoid excessive resource registration.
 * - Combinations of URIs build quickly the more params you have. We attempt to register the most common ones
 *     `single params`, `no params`, and `all params`.
 *
 * @note This is a work-around for the MCP SDK's current strict URI Template matching requirements,
 * remove accordingly.
 *
 * @param {McpServer} server - MCP Server instance
 * @param name - Resource name
 * @param uriOrTemplate - URI or ResourceTemplate
 * @param config - Resource metadata configuration
 * @param callback - Callback function for resource read operations
 * @param metadata - McpResource metadata
 * - `metadata.complete`: Callback functions for resource read operations completion
 * - `metadata.useAllCombinations`: Whether to register all search parameter permutations or not.
 */
const registerResource = (
  server: McpServer,
  name: McpResource[0],
  uriOrTemplate: McpResource[1],
  config: McpResource[2],
  callback: McpResource[3],
  metadata: McpResource[4]
) => {
  if (!server) {
    return;
  }

  if (uriOrTemplate instanceof ResourceTemplate) {
    const templateStr = uriOrTemplate.uriTemplate.toString();
    const [remainingBaseUri, remainingUri] = templateStr.split('{?');
    // Technically the hash should fall after a query, just a precaution
    const baseUri = remainingBaseUri?.split('{#')?.[0];
    const searchUri = remainingUri?.split('}')?.[0]?.toLowerCase();

    // Register the template's base URI
    if (baseUri) {
      server.registerResource(name, baseUri, config, callback);
    }

    // Register incremental search params instead of every potential combination.
    if (searchUri && metadata?.complete) {
      const allVariableNames = uriOrTemplate.uriTemplate.variableNames;
      const searchParams = allVariableNames.filter(name => searchUri.includes(name.toLowerCase()));

      const register = (incrementalParams: string[]) => {
        if (incrementalParams.length) {
          const resourceTemplate = new ResourceTemplate(`${baseUri}{?${incrementalParams.join(',')}}`, {
            list: undefined,
            complete: metadata.complete as {
              [variable: string]: CompleteResourceTemplateCallback;
            }
          });

          server.registerResource(`${name}-${incrementalParams.join('-')}`, resourceTemplate, config, callback);
        }
      };

      if (metadata?.registerAllSearchCombinations) {
        const paramCombinations = (params: string[]) =>
          params.reduce((acc, val) => acc.concat(acc.map(prev => [...prev, val])), [[]] as string[][]);

        paramCombinations(searchParams).forEach(combination => register(combination));

        return;
      }

      searchParams.forEach((param, index) => register(searchParams.slice(0, index + 1)));

      return;
    }
  }

  // Register a string or fallthrough URI
  // Note: uri is being cast as any to bypass a type mismatch introduced at the MCP SDK level. Rereview when SDK is updated.
  server.registerResource(name, uriOrTemplate as any, config, callback);
};

export { registerResource };

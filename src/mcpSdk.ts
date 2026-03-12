import {
  ResourceTemplate,
  type McpServer,
  //   type ResourceMetadata,
  // type ReadResourceCallback,
  type CompleteResourceTemplateCallback,
  type ListResourcesCallback
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
    // server.registerResource(name, uriOrTemplate, config, callback);

    const templateStr = uriOrTemplate.uriTemplate.toString();
    const [remainingBaseUri, remainingUri] = templateStr.split('{?');
    // Technically, the hash should fall after a query, just a precaution
    const baseUri = remainingBaseUri?.split('{#')?.[0];
    const searchUri = remainingUri?.split('}')?.[0]?.toLowerCase();

    // Register all combinations OR incremental search params
    if (baseUri && searchUri && metadata?.complete) {
      const allVariableNames = uriOrTemplate.uriTemplate.variableNames;
      const searchParams = allVariableNames.filter(name => searchUri.includes(name.toLowerCase()));

      // Register combinations
      const register = (incrementalParams: string[]) => {
        const newUri = incrementalParams.length ? `${baseUri}{?${incrementalParams.join(',')}}` : baseUri;
        const newName = incrementalParams.length ? `${name}-${incrementalParams.join('-')}` : `${name}-empty`;
        const newList = incrementalParams.length === 0 ? metadata?.list : undefined;

        const resourceTemplate = new ResourceTemplate(newUri, {
          list: newList as ListResourcesCallback | undefined,
          complete: metadata.complete as {
            [variable: string]: CompleteResourceTemplateCallback;
          }
        });

        server.registerResource(newName, resourceTemplate, config, callback);
      };

      // Variation for all combos
      const paramAllCombinations = (params: string[]) =>
        params.reduce((acc, val) => acc.concat(acc.map(prev => [...prev, val])), [[]] as string[][]);

      // Variation for incremental combos
      const paramIncrementalCombinations = (params: string[]) =>
        params.reduce((acc, val) => {
          const lastArray = acc[acc.length - 1] || [];

          acc.push([...lastArray, val]);

          return acc;
        }, [[]] as string[][]);

      // Register all but the full combination, let that pass through and register last
      if (metadata?.registerAllSearchCombinations) {
        paramAllCombinations(searchParams)
          .filter(combination => combination.length < searchParams.length)
          .forEach(combination => register(combination));
      } else {
        paramIncrementalCombinations(searchParams)
          .filter(combination => combination.length < searchParams.length)
          .forEach(combination => register(combination));
      }
    }

    /*
      // Loop all search combinations, including an empty search combination
      if (metadata?.registerAllSearchCombinations) {

        paramAllCombinations(searchParams)
          // .filter(params => params.length !== searchParams.length)
          .filter(combination => combination.length < searchParams.length)
          .forEach(combination => register(combination));

      // Or loop incremental search combinations, including an empty search combination
      } else {
        const paramCombinations = (params: string[]) =>
          params.reduce((acc, val) => {
            const lastArray = acc[acc.length - 1] || [];

            acc.push([...lastArray, val]);
            // return [...acc, [...lastArray, val]];
            return acc;
          }, [] as string[][]);
          // return params.reduce((acc, val) => {
          //  return acc.concat(acc[acc.length - 1] || [], val);
          // }, [[]]);

          /*
            const lastArray = acc.length ? acc[acc.length - 1] : [];

            acc.push([...(lastArray as string[]), val]);

            return acc;
            * /
        };

        // Register empty
        register([]);

        // Incremental search combinations
        searchParams.slice(0, searchParams.length - 1).forEach((param, index) => register(searchParams.slice(0, index + 1)));
      }
      */
  }

  // Register a string or fallthrough URI
  // Note: uri is being cast as any to bypass a type mismatch introduced at the MCP SDK level. Rereview when SDK is updated.
  server.registerResource(name, uriOrTemplate as any, config, callback);
};

export { registerResource };

import {
  ResourceTemplate,
  type McpServer,
  //   type ResourceMetadata,
  // type ReadResourceCallback,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';

// Helper to get all combinations of an array
// const getCombinations = (params: string[]) =>
// params.reduce((acc, val) => acc.concat(acc.map(prev => [...prev, val])), [[]] as string[][]);

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
  // { useIncrementalSearchParams = true }: { useIncrementalSearchParams?: boolean } = {}
) => {
  if (!server) {
    return;
  }

  if (uriOrTemplate instanceof ResourceTemplate) {
    const templateStr = uriOrTemplate.uriTemplate.toString();
    const [remainingBaseUri, remainingUri] = templateStr.split('{?');
    const baseUri = remainingBaseUri?.split('{')?.[0];
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
        const resourceTemplate = new ResourceTemplate(`${baseUri}{?${incrementalParams.join(',')}}`, {
          list: undefined,
          complete: metadata.complete as {
            [variable: string]: CompleteResourceTemplateCallback;
          }
        });

        server.registerResource(`${name}-${incrementalParams.join('-')}`, resourceTemplate, config, callback);
      };

      if (metadata?.useAllCombinations) {
        const getCombinations = (params: string[]) =>
          params.reduce((acc, val) => acc.concat(acc.map(prev => [...prev, val])), [[]] as string[][]);

        getCombinations(searchParams).forEach(combination => register(combination));

        return;
      }

      searchParams.forEach((param, index) => register(searchParams.slice(0, index + 1)));

      return;
    }
  }

  // Register a string or fallthrough URI
  // Note: uri is being cast as any to bypass a type mismatch introduced at the MCP SDK level. Rereview when SDK is updated.
  server.registerResource(name, uriOrTemplate as any, config, callback);

/*

  const uriTemplate = (uri as ResourceTemplate).uriTemplate;
  const parts = (uriTemplate as any).parts as Array<string | { operator: string; names: string[] }>;
  const queryPart = parts.find(part =>
    typeof part === 'object' && (part.operator === '?' || part.operator === '&')) as { operator: string; names: string[] } | undefined;

  if (!queryPart) {
    // Standard registration for static URIs or templates without query params
    server.registerResource(name, uri as any, config, callback);

    return;
  }

  const baseUri = parts
    .filter(p => typeof p === 'string' || (typeof p === 'object' && p.operator !== '?' && p.operator !== '&'))
    .map(p => typeof p === 'string' ? p : `{${p.operator}${p.names.join(',')}}`)
    .join('');

  const operator = queryPart.operator;
  const params = queryPart.names;

  // 1. Register the static base (e.g., 'patternfly://docs/index')
  if (operator === '?') {
    server.registerResource(`${name}-base`, baseUri as any, config, callback);
  }

  // 2. Register incremental variations (e.g., {?v}, {?v,c}, {?v,c,s})
  for (let i = 1; i <= params.length; i++) {
    const subParams = params.slice(0, i).join(',');
    const subTemplate = `${baseUri}{${operator}${subParams}}`;

    /*
    server.registerResource(`${name}-var-${i}`, new ResourceTemplate(subTemplate, {
      // Re-apply completions from the original template
      complete: (template as any)._callbacks?.complete,
      // Suppress 'list' on variations to prevent catalog clutter
      list: undefined
    }) as any, config, callback);
     * /
  }



  /*
  // Regex to split base URI from the {?p1,p2...} block
  const templateMatch = uriTemplate.match(/^(.*?)\{((\?|&)(.*?))\}/);

  if (!templateMatch) {
    // Fallback for non-template resources or path-parameter only templates
    server.registerResource(name, uriTemplate as any, config, callback);

    return;
  }

  const baseUri = templateMatch[1];
  const operator = templateMatch[3]; // '?' or '&'
  const params = templateMatch[4].split(',');

  // 1. Register the static base (e.g., 'patternfly://docs/index')
  if (operator === '?') {
    server.registerResource(`${name}-base`, baseUri as any, config, callback);
  }

  // 2. Register incremental variations
  // If template is {?version,category,section}, this creates:
  // - {?version}
  // - {?version,category}
  // - {?version,category,section}
  for (let i = 1; i <= params.length; i++) {
    const subParams = params.slice(0, i).join(',');
    const subTemplate = `${baseUri}{${operator}${subParams}}`;

    server.registerResource(`${name}-var-${i}`, new ResourceTemplate(subTemplate, {
      ...templateOptions,
      // Suppress 'list' on variations to prevent catalog clutter;
      // the index is handled by the primary resource.
      list: undefined
    }) as any, config, callback);
  }
   */
};

export { registerResource };

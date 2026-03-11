import {
  ResourceTemplate,
  type McpServer,
  type ResourceMetadata,
  type ReadResourceCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register an MCP resource.
 *
 * Capable of registering each resource variation indicated when a URI template is used,
 * making the parameterized URIs for query/search strings optional instead of required.
 *
 * @note This is a work-around for the MCP SDK's current strict URI Template matching requirements,
 * remove accordingly.
 *
 * @param server
 * @param name
 * @param uri
 * @param config
 * @param callback
 */
const registerResource = (
  server: McpServer,
  name: string,
  uri: string | ResourceTemplate,
  config: ResourceMetadata,
  callback: ReadResourceCallback // (...args: unknown[]) => unknown | Promise<unknown>,
  // templateOptions: unknown = {}
) => {
  if (!server) {
    return;
  }

  // const [baseUri = '', baseUriParams = ''] = (uri as string)?.split('{?') || [];
  // const uriParams: string[] | undefined = baseUriParams.split('}')[0]?.split(',')?.map(param => param.trim());

  if (!uriParams?.length) {
    // Note: uri is being cast as any to bypass a type mismatch introduced at the MCP SDK level. Rereview when SDK is updated.
    server.registerResource(name, uri as any, config, callback);

    return;
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

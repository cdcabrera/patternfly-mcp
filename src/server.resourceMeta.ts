import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { log } from './logger';
import { type McpResource } from './server';
import {
  listAllCombinations,
  listIncrementalCombinations,
  stringJoin
} from './server.helpers';
import { paramCompletion } from './resource.helpers';
import { type GlobalOptions, type AppSession } from './options';
import { runWithOptions, runWithSession } from './options.context';

/**
 * Generate a standardized metadata table for resource discovery.
 *
 * @param options
 * @param options.title
 * @param options.description
 * @param options.params
 * @param options.exampleUris
 */
const generateMetaTable = (options: {
  title: string;
  description: string;
  params: { name: string; values: string[]; description: string }[];
  exampleUris: { label: string; uri: string }[];
}) => {
  const tableRows = options.params.map(
    param => `| \`${param.name}\` | ${param.values.map(value => `\`${value}\``).join(', ')} | ${param.description} |`
  );

  const exampleLines = options.exampleUris.map(example => `- **${example.label}**: \`${example.uri}\``);

  return stringJoin.newline(
    `# Resource Metadata: ${options.title}`,
    options.description,
    '',
    '### Available Parameters',
    '',
    '| Parameter | Valid Values | Description |',
    '| :--- | :--- | :--- |',
    ...tableRows,
    '',
    '### Example URIs',
    'If your client does not support interactive completions, use these patterns:',
    ...exampleLines
  );
};

/**
 * Get all registered URI variations for a template.
 *
 * @param {string} baseUri - The base URI string.
 * @param {string[]} params - The variable names.
 * @param {boolean} [allCombos=false] - Whether to generate all permutations.
 * @returns {string[]} Array of formatted URI examples.
 */
const getUriVariations = (baseUri: string, params: string[], allCombos = false): string[] => {
  const combinations = allCombos ? listAllCombinations(params) : listIncrementalCombinations(params);

  return combinations.map(combo => (combo.length ? `${baseUri}?${combo.map(param => `${param}=...`).join('&')}` : baseUri));
};

/**
 * Wrap a resource registration with automatic metadata registration.
 * If `metadata.enableMeta` is true, it registers a /meta resource and enhances the callback.
 *
 * @param {McpServer} server - MCP Server instance
 * @param name - Resource name
 * @param uriOrTemplate - URI or ResourceTemplate
 * @param config - Resource metadata configuration
 * @param callback - Callback function for resource read operations
 * @param metadata - McpResource metadata
 * @param {GlobalOptions} options - Global options
 * @param {AppSession} session - App session
 * @returns {McpResource} The (potentially enhanced) resource details
 */
const registerResourceMeta = (
  server: McpServer,
  name: McpResource[0],
  uriOrTemplate: McpResource[1],
  config: McpResource[2],
  callback: McpResource[3],
  metadata: McpResource[4],
  options: GlobalOptions,
  session: AppSession
): McpResource => {
  if (metadata?.enableMeta && metadata.metaHandler) {
    const baseUri = (uriOrTemplate instanceof ResourceTemplate
      ? uriOrTemplate.uriTemplate?.toString()?.split('{?')[0]
      : (uriOrTemplate as string).split('?')[0]) || '';

    const metaName = `${name}-meta`;
    const metaUri = `${baseUri}/meta{?version}`;

    const searchParams = uriOrTemplate instanceof ResourceTemplate ? uriOrTemplate.uriTemplate?.variableNames || [] : [];

    // Generate possible combinations of URIs
    const exampleUris = getUriVariations(baseUri, searchParams, Boolean(metadata.registerAllSearchCombinations)).map(uri => ({
      label: uri === baseUri ? 'Base View' : `Filtered View (${uri.split('?')[1]})`,
      uri
    }));

    // Register the sibling /meta resource
    const metaResourceTemplate = new ResourceTemplate(metaUri, {
      list: undefined,
      ...(metadata.complete ? { complete: metadata.complete } : {})
    });

    log.info(`Registered resource: ${metaName}`);
    server.registerResource(
      metaName,
      metaResourceTemplate,
      {
        title: `${config.title} Metadata`,
        description: `Discovery manual for ${config.title}.`
      },
      async (uri: URL, variables: any) =>
        runWithSession(session, async () =>
          runWithOptions(options, async () => {
            const { version } = variables as { version?: string };
            const params = await paramCompletion({ version });
            const metaTableOptions = await metadata.metaHandler!(version, params);

            return {
              contents: [
                {
                  uri: uri.toString(),
                  mimeType: 'text/markdown',
                  text: generateMetaTable({
                    ...metaTableOptions,
                    exampleUris
                  })
                }
              ]
            };
          }))
    );

    // Enhance the primary callback to bundle metadata
    const enhancedCallback = async (uri: URL, variables: any) => {
      const result = await callback(uri, variables);

      return runWithSession(session, async () =>
        runWithOptions(options, async () => {
          const { version } = variables as { version?: string };
          const params = await paramCompletion({ version });
          const metaTableOptions = await metadata.metaHandler!(version, params);

          if (result.contents) {
            result.contents.push({
              uri: `${baseUri}/meta${version ? `?version=${version}` : ''}`,
              mimeType: 'text/markdown',
              text: generateMetaTable({
                ...metaTableOptions,
                exampleUris
              })
            });
          }

          return result;
        }));
    };

    return [name, uriOrTemplate, config, enhancedCallback, metadata];
  }

  return [name, uriOrTemplate, config, callback, metadata];
};

export { generateMetaTable, getUriVariations, registerResourceMeta };

// import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
// import { log } from './logger';
import { type McpResource, type McpResourceCreator } from './server';
import {
  // isPlainObject,
  listAllCombinations,
  listIncrementalCombinations,
  splitUri,
  stringJoin
} from './server.helpers';
// import { paramCompletion } from './resource.helpers';
// import { type GlobalOptions, type AppSession } from './options';
import { getOptions, runWithOptions } from './options.context';

const generateMarkdownTable = (columnHeaders: string[], rows: (string | string[])[][], { wrapContents = [] }: { wrapContents?: boolean[] } = {}) => {
  const wrapValue = (value: string | string[], index: number) => {
    if (!wrapContents[index]) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(val => `\`${val}\``).join(', ');
    }

    return `\`${value}\``;
  };

  const tableRows = rows.map(row => row.map((cell, index) => `| ${wrapValue(cell, index)} |`).join(''));
  const tableHeader = `| ${columnHeaders.join(' | ')} |`;
  const tableSeparator = `| ${columnHeaders.map(() => ':---').join(' | ')} |`;

  return stringJoin.newline(
    tableHeader,
    tableSeparator,
    ...tableRows
  );
};

/**
 * Generate a standardized metadata table for resource discovery.
 *
 * @param options
 * @param options.title
 * @param options.description
 * @param options.params
 * @param options.exampleUris
 */
const generateMetaContent = ({ title, description, params, exampleUris = [] }: {
  title: string;
  description: string;
  params: { name: string; values: string[]; description: string }[];
  exampleUris?: { label: string; uri: string }[];
}) => {
  // const wrapStr = (val:string) => `\`${val}\``;
  // const tableRows = params.map(
  //  param => `| ${wrapStr(param.name)} | ${param.values.map(value => wrapStr(value)).join(', ')} | ${wrapStr(param.description)} |`
  // );
  let table = '';
  let examples = '';

  if (params.length) {
    const tableRows = params.map(({ name, values, description }) => [name, values, description]);

    table = stringJoin.newline(
      '',
      '### Available Parameters',
      '',
      generateMarkdownTable(['Parameter', 'Valid Values', 'Description'], tableRows, { wrapContents: [true, true, false] })
      // '| Parameter | Valid Values | Description |',
      // '| :--- | :--- | :--- |',
      // ...tableRows
    );
  }

  if (exampleUris.length) {
    const exampleUriLines = exampleUris.map(example => `- **${example.label}**: \`${example.uri}\``);

    examples = stringJoin.newline(
      '',
      '### Available Patterns',
      ...exampleUriLines
    );
  }

  return stringJoin.newline(
    `# Resource Metadata: ${title}`,
    description,
    table,
    examples
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

  return combinations.map(combo => {
    let str = baseUri;

    if (combo.length) {
      str += `?${combo.map(param => `${param}=...`).join('&')}`;
    }

    return str;
  });
};

const setMetaResources = (resources: McpResourceCreator[], options = getOptions()) => {
  const updatedResources: McpResourceCreator[] = [];
  // resources.filter(resource => resource[4]?.enableMeta);

  resources.forEach(resourceCreator => {
    const [name, uriOrTemplate, config, callback, metadata] = resourceCreator(options);

    if (!metadata?.metaConfig) {
      updatedResources.push(resourceCreator);

      return;
    }

    const isResourceTemplate = uriOrTemplate instanceof ResourceTemplate;
    let metaUri = metadata.metaConfig.uri;
    let baseUri: string | undefined;
    let searchUri: string[] | undefined;

    if (metaUri) {
      const { base, search } = splitUri(metaUri);

      baseUri = base;
      searchUri = search;
    } else {
      metaUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;
      const { base, search } = splitUri(metaUri);

      baseUri = base;
      searchUri = search;
    }

    if (!baseUri) {
      updatedResources.push(resourceCreator);

      return;
    }

    // let baseUri: string | undefined;

    // if (metaUri) {
    //  const {} = splitUri(metaUri);
    // }
    /*
    if (!metaUri) {
      metaUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;

      const { base } =  splitUri(metaUri);
      baseUri = base;

      if (base) {
        metaUri = `${baseUri}/meta{?version}`;
      }
    }

    if (!metaUri) {
      updatedResources.push(resourceCreator);

      return;
    }
    */

    // Generate possible combinations of URIs
    const searchParams = (isResourceTemplate && uriOrTemplate.uriTemplate?.variableNames) || searchUri || [];
    const exampleUris = getUriVariations(baseUri, searchParams, Boolean(metadata.registerAllSearchCombinations)).map(uri => ({
      label: uri === baseUri ? 'Base View' : `Filtered View (${uri.split('?')[1]})`,
      uri
    }));

    const metaName = metadata.metaConfig.name || `${name}-meta`;
    const metaResourceTemplate = new ResourceTemplate(metaUri, {
      list: undefined
      // ...(metadata.complete ? { complete: metadata.complete } : {})
    });
    const metaTitle = metadata.metaConfig.title || `${config.title} Metadata`;
    const metaDescription = metadata.metaConfig.description || `Discovery manual for ${config.title}.`;
    const metaMimeType = metadata.metaConfig.mimeType || 'text/markdown';
    // let metaHandler: Promise<{ name: string; values: string[]; description: string }[]> | undefined; // = metadata.metaConfig.metaHandler;
    let metaHandler: any;

    if (!metaHandler && metadata.complete) {
      metaHandler = async (version: string) => {
        const params = [];

        for (const prop in metadata.complete) {
          const name = prop;
          const description = `Filter by ${name}`;
          let values: string[] = [];

          if (metadata.complete[prop]) {
            values = await metadata.complete[prop]('', { arguments: { version } });
          }

          params.push({ name, values, description });
        }

        return params;
      };
    }

    // Create a new meta-resource
    const metaResource = (opts = options): McpResource => {
      const metaCallback: McpResource[3] = async (passedUri, variables) =>
        runWithOptions(opts, async () => {
          const { version } = variables || {};
          // const params = await paramCompletion({ version });
          const params = await metaHandler?.(version);

          return {
            contents: [
              {
                uri: passedUri?.toString(),
                mimeType: metaMimeType,
                text: generateMetaContent({
                  // params: [],
                  title: metaTitle,
                  description: metaDescription,
                  params,
                  exampleUris,
                  // ...metaTableOptions
                })
              }
            ]
          };
        });

      return [
        metaName,
        metaResourceTemplate,
        {
          title: metaTitle,
          description: metaDescription,
          mimeType: metaMimeType
        },
        metaCallback
      ];
    };

    updatedResources.push(metaResource);

    // Add the meta-resource enhancement to the existing resource
    const enhancedResource = (opts = options): McpResource => {
      const metaEnhancedCallback: McpResource[3] = async (passedUri, variables) =>
        runWithOptions(opts, async () => {
          const result = await callback(passedUri, variables);

          const { version } = variables || {};
          // const params = await paramCompletion({ version });
          const params = await metaHandler?.(version);

          if (result.contents) {
            result.contents.push({
              // uri: `${baseUri}/meta${version ? `?version=${version}` : ''}`,
              uri: `${baseUri}${version ? `?version=${version}` : ''}`,
              mimeType: metaMimeType,
              // mimeType: 'text/markdown',
              text: generateMetaContent({
                // ...metaTableOptions,
                // exampleUris
                title: metaTitle,
                description: metaDescription,
                params,
                exampleUris
              })
            });
          }

          return result;
        });

      return [name, uriOrTemplate, config, metaEnhancedCallback, metadata];
    };

    updatedResources.push(enhancedResource);
  });

  return updatedResources;
};

/*
const setMetaResourcesOLD = (resources: McpResourceCreator[], options = getOptions()) => {
  const updatedResources: McpResourceCreator[] = [];
  // resources.filter(resource => resource[4]?.enableMeta);

  resources.forEach(resourceCreator => {
    const [name, uriOrTemplate, config, callback, metadata] = resourceCreator(options);

    if (!metadata?.metaConfig) {
      updatedResources.push(resourceCreator);

      return;
    }

    const isResourceTemplate = uriOrTemplate instanceof ResourceTemplate;
    let metaUri = metadata.metaConfig.uri;

    if (!metaUri) {
      baseUri = isResourceTemplate
        ? uriOrTemplate.uriTemplate?.toString()?.split('{?')[0]
        : (uriOrTemplate as string).split('?')[0];

      if (baseUri) {
        metaUri = `${baseUri}/meta{?version}`;
      }
    }

    if (!metaUri) {
      updatedResources.push(resourceCreator);

      return;
    }

    const metaName = metadata.metaConfig.name || `${name}-meta`;
    const metaResourceTemplate = new ResourceTemplate(metaUri, {
      list: undefined,
      ...(metadata.complete ? { complete: metadata.complete } : {})
    });
    const metaTitle = metadata.metaConfig.title || `${config.title} Metadata`;
    const metaDescription = metadata.metaConfig.description || `Discovery manual for ${config.title}.`;
    const metaMimeType = metadata.metaConfig.mimeType || 'text/markdown';
    const metaHandler = metadata.metaConfig.metaHandler;

    // Generate possible combinations of URIs
    const searchParams = (isResourceTemplate && uriOrTemplate.uriTemplate?.variableNames) || [];
    const exampleUris = getUriVariations(baseUri, searchParams, Boolean(metadata.registerAllSearchCombinations)).map(uri => ({
      label: uri === baseUri ? 'Base View' : `Filtered View (${uri.split('?')[1]})`,
      uri
    }));

    // Create a new meta-resource
    const metaCallback: McpResource[3] = async (passedUri, variables) =>
      runWithOptions(options, async () => {
        const { version } = variables || {};
        const params = await paramCompletion({ version });
        const metaTableOptions = await metaHandler?.(version, params);

        return {
          contents: [
            {
              uri: passedUri?.toString(),
              mimeType: 'text/markdown',
              text: generateMetaTable({
                ...metaTableOptions,
                exampleUris
              })
            }
          ]
        };
      });

    updatedResources.push(() => [
      metaName,
      metaResourceTemplate,
      {
        title: metaTitle,
        description: metaDescription,
        mimeType: metaMimeType
      },
      metaCallback
    ]);

    // Add the meta-resource enhancement to the existing resource
    const metaEnhancedCallback: McpResource[3] = async (passedUri, variables) =>
      runWithOptions(options, async () => {
        const result = await callback(passedUri, variables);

        const { version } = variables || {};
        const params = await paramCompletion({ version });
        const metaTableOptions = await metaHandler?.(version, params);

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
      });

    updatedResources.push(() => [name, uriOrTemplate, config, metaEnhancedCallback, metadata]);
  });

  return updatedResources;
};

 */

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
/*
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
*/

export { generateMetaContent, generateMarkdownTable, getUriVariations, setMetaResources };

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource, type McpResourceCreator } from './server';
import {
  listAllCombinations,
  listIncrementalCombinations,
  splitUri,
  stringJoin
} from './server.helpers';
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
  let table = '';
  let examples = '';

  if (params.length) {
    const tableRows = params.map(({ name, values, description }) => [name, values, description]);

    table = stringJoin.newline(
      '',
      '### Available Parameters',
      '',
      generateMarkdownTable(['Parameter', 'Valid Values', 'Description'], tableRows, { wrapContents: [true, true, false] })
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
    // let searchUri: string[] | undefined;

    if (metaUri) {
      const { base } = splitUri(metaUri);

      baseUri = base;
      // searchUri = search;
    } else {
      // metaUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;
      const tempUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;
      const { base } = splitUri(tempUri);

      baseUri = base;

      if (base) {
        baseUri = `${base}/meta`;
        metaUri = `${baseUri}{?version}`;
      }

      // searchUri = search;
    }

    if (!baseUri || !metaUri) {
      updatedResources.push(resourceCreator);

      return;
    }

    // Generate possible combinations of URIs
    // const searchParams = (isResourceTemplate && uriOrTemplate.uriTemplate?.variableNames) || searchUri || [];
    const searchParams = (isResourceTemplate && uriOrTemplate.uriTemplate?.variableNames) || (metadata.complete && Object.keys(metadata.complete)) || [];
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
    let metaHandler = metadata.metaConfig.metaHandler;

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
          const params = await metaHandler?.(version) || [];

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
                  exampleUris
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
          const params = await metaHandler?.(version) || [];

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

export { generateMetaContent, generateMarkdownTable, getUriVariations, setMetaResources };

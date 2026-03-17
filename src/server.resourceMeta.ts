import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource, type McpResourceCreator } from './server';
import {
  listAllCombinations,
  listIncrementalCombinations,
  splitUri,
  stringJoin
} from './server.helpers';
import { getOptions, runWithOptions } from './options.context';

/**
 * Generate a basic Markdown table with optional content wrapping.
 *
 * @param columnHeaders - Column headers for the table.
 * @param rows - Rows of data to include in the table.
 * @param [options] - Options for table generation.
 * @param [options.wrapContents] - Optional array of booleans that aligns to each column and indicates whether to wrap the content.
 * @returns A Markdown table string.
 */
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

  const tableRows = rows.map(row => `| ${row.slice(0, columnHeaders.length).map((cell, index) => wrapValue(cell, index)).join(' | ')} |`);
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
 * @param settings
 * @param settings.title - Resource title or name.
 * @param settings.description - Resource description.
 * @param settings.params - Parameter details for the resource.
 * @param [settings.exampleUris] - Example URIs for the resource.
 * @returns Markdown content for resource metadata.
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
      '## Available Parameters',
      '',
      generateMarkdownTable(['Parameter', 'Valid Values', 'Description'], tableRows, { wrapContents: [true, true, false] })
    );
  }

  if (exampleUris.length) {
    const exampleUriLines = exampleUris.map(example => `- **${example.label}**: \`${example.uri}\``);

    examples = stringJoin.newline(
      '',
      '## Available Patterns',
      ...exampleUriLines
    );
  }

  return stringJoin.newline(
    `# ${title}`,
    description,
    table,
    examples
  );
};

/**
 * Get all registered URI variations for a template.
 *
 * @param baseUri - The base URI string.
 * @param params - The variable names.
 * @param [allCombos=false] - Whether to generate all permutations.
 * @returns Array of formatted URI examples.
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

/**
 * Enhances and generates meta-resources for a set of resources.
 *
 * - Adds a new meta-resource if a configuration is provided
 * - Modifies the original resource to indicate a meta-resource is available
 *
 * @param {McpResourceCreator[]} resources - List of resource creators to process and enhance.
 * @param [options] - Optional settings.
 * @returns {McpResourceCreator[]} An updated list of resource creators, including any added or modified meta-resources.
 */
const setMetaResources = (resources: McpResourceCreator[], options = getOptions()) => {
  const updatedResources: McpResourceCreator[] = [];

  resources.forEach(resourceCreator => {
    const [name, uriOrTemplate, config, callback, metadata] = resourceCreator(options);

    if (!metadata?.metaConfig) {
      updatedResources.push(resourceCreator);

      return;
    }

    const isResourceTemplate = uriOrTemplate instanceof ResourceTemplate;
    let metaUri = metadata.metaConfig.uri;
    let baseUri: string | undefined;

    const tempOriginaUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;
    const { base: originalBaseUri } = splitUri(tempOriginaUri);

    if (metaUri) {
      const { base } = splitUri(metaUri);

      baseUri = base;
    } else if (originalBaseUri) {
      baseUri = `${originalBaseUri}/meta`;
      metaUri = `${baseUri}{?version}`;
    }

    if (!baseUri || !metaUri || !originalBaseUri) {
      updatedResources.push(resourceCreator);

      return;
    }

    // Generate possible combinations of URIs
    const searchParams = (isResourceTemplate && uriOrTemplate.uriTemplate?.variableNames) || (metadata.complete && Object.keys(metadata.complete)) || [];
    const exampleUris = getUriVariations(originalBaseUri, searchParams, Boolean(metadata.registerAllSearchCombinations)).map(uri => {
      const searchParams = uri.split('?')[1];

      return {
        label: !searchParams ? 'Base View' : `Filtered View (${searchParams})`,
        uri
      };
    });

    const metaName = metadata.metaConfig.name || `${name}-meta`;
    const metaResourceTemplate = new ResourceTemplate(metaUri, {
      list: undefined
      // ...(metadata.complete ? { complete: metadata.complete } : {})
    });
    const metaTitle = metadata.metaConfig.title || `${config.title} Metadata`;
    const metaDescription = metadata.metaConfig.description || `Discovery manual for ${config.title}.`;
    const metaMimeType = metadata.metaConfig.mimeType || 'text/markdown';
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
          const params = await metaHandler?.(version) || [];

          return {
            contents: [
              {
                uri: passedUri?.toString(),
                mimeType: metaMimeType,
                text: generateMetaContent({
                  title: metaTitle,
                  description: metaDescription,
                  params,
                  exampleUris
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
          const params = await metaHandler?.(version) || [];

          if (result.contents) {
            result.contents.push({
              uri: `${baseUri}${version ? `?version=${version}` : ''}`,
              mimeType: metaMimeType,
              text: generateMetaContent({
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

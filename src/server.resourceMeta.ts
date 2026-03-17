import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource, type McpResourceCreator, type McpResourceMetadata } from './server';
import {
  isPlainObject,
  listAllCombinations,
  listIncrementalCombinations,
  splitUri,
  stringJoin
} from './server.helpers';
import { getOptions, runWithOptions } from './options.context';

/**
 * Generate a basic Markdown table with optional content wrapping.
 *
 * @note Consider relocating this function to somewhere like a "resourceHelpers"
 * if we end up using it in multiple places.
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

const setMetaHandler = ({ baseUri, searchParams, complete, registerAllSearchCombinations, title, description }: {
  baseUri: string;
  searchParams: string[];
  complete: McpResourceMetadata['complete'];
  registerAllSearchCombinations: McpResourceMetadata['registerAllSearchCombinations'];
  title: McpResourceMetadata['metaConfig']['title'];
  description: McpResourceMetadata['metaConfig']['description'];
}) => {
  const exampleUris = getUriVariations(baseUri, searchParams, Boolean(registerAllSearchCombinations)).map(uri => {
    const searchParams = uri.split('?')[1];

    return {
      label: !searchParams ? 'Base View' : `Filtered View (${searchParams})`,
      uri
    };
  });

  return async (version: string) => {
    const params = [];

    if (complete) {
      for (const prop in complete) {
        const name = prop;
        const description = `Filter by ${name}`;
        let values: string[] = [];

        if (complete[prop]) {
          values = await complete[prop]('', { arguments: { version } });
        }

        params.push({ name, values, description });
      }
    }

    return generateMetaContent({
      title,
      description,
      params: params || [],
      exampleUris
    });
  };
};

/**
 * Generate related metadata URIs and parameters.
 *
 * @param options - Input options
 * @param options.uriOrTemplate - Original URI or a `ResourceTemplate` instance to parse.
 * @param options.configUri - Passed metadata configuration URI.
 * @param options.complete - Passed metadata "complete" settings associated with the resource.
 * @returns An object containing the baseOriginalUri, baseUri, metaUri, and searchParams.
 *  - `baseOriginalUri` - Original URI base derived from the input.
 *  - `baseUri` - Generated base URI.
 *  - `metaUri` - Generated full metadata URI, combined with `baseUri`
 *  - `searchParams` - Array of search parameter names derived from the URI template or metadata "complete"
 */
const getUriBreakdown = ({ uriOrTemplate, configUri, complete }: {
  uriOrTemplate: string | ResourceTemplate,
  configUri: McpResourceMetadata['metaConfig']['uri'],
  complete: McpResourceMetadata['complete']
}) => {
  const isResourceTemplate = uriOrTemplate instanceof ResourceTemplate;
  let metaUri = configUri;
  let baseUri: string | undefined;

  const tempOriginalUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;
  const { base: baseOriginalUri } = splitUri(tempOriginalUri);

  if (metaUri) {
    const { base } = splitUri(metaUri);

    baseUri = base;
  } else if (baseOriginalUri) {
    baseUri = `${baseOriginalUri}/meta`;
    metaUri = `${baseUri}{?version}`;
  }

  const searchParams = (isResourceTemplate && uriOrTemplate.uriTemplate?.variableNames) || (complete && Object.keys(complete)) || [];

  return {
    baseOriginalUri,
    baseUri,
    metaUri,
    searchParams
  };
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

  // Check each resource for meta-config
  resources.forEach(resourceCreator => {
    const [name, uriOrTemplate, config, callback, metadata] = resourceCreator(options);

    // No meta-config available, move to the next resource
    if (!metadata?.metaConfig) {
      updatedResources.push(resourceCreator);

      return;
    }

    // const isResourceTemplate = uriOrTemplate instanceof ResourceTemplate;
    /*
    let metaUri = metadata.metaConfig.uri;
    let baseUri: string | undefined;

    const tempOriginalUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;
    const { base: originalBaseUri } = splitUri(tempOriginalUri);

    if (metaUri) {
      const { base } = splitUri(metaUri);

      baseUri = base;
    } else if (originalBaseUri) {
      baseUri = `${originalBaseUri}/meta`;
      metaUri = `${baseUri}{?version}`;
    }
    */
    // Get a URI breakdown
    const uriBreakdown = getUriBreakdown({ uriOrTemplate, configUri: metadata.metaConfig.uri, complete: metadata.complete });

    // If no URI breakdown assume resource is still valid
    if (!uriBreakdown.baseUri || !uriBreakdown.metaUri || !uriBreakdown.baseOriginalUri) {
      updatedResources.push(resourceCreator);

      return;
    }

    // Create a new meta-resource template
    const metaResourceTemplate = new ResourceTemplate(uriBreakdown.metaUri, {
      list: undefined
      // ...(metadata.complete ? { complete: metadata.complete } : {})
    });

    const metaName = metadata.metaConfig.name || `${name}-meta`;
    const metaTitle = metadata.metaConfig.title || `${config.title} Metadata`;
    const metaDescription = metadata.metaConfig.description || `Discovery manual for ${config.title}.`;
    const metaMimeType = metadata.metaConfig.mimeType || 'text/markdown';

    const metaHandler = metadata.metaConfig.metaHandler || setMetaHandler({
      baseUri: uriBreakdown.baseOriginalUri,
      searchParams: uriBreakdown.searchParams,
      complete: metadata.complete,
      registerAllSearchCombinations: metadata.registerAllSearchCombinations,
      title: metaTitle,
      description: metaDescription
    });

    // Create a new meta-resource
    const metaResource = (opts = options): McpResource => {
      const metaCallback: McpResource[3] = async (passedUri, variables) =>
        runWithOptions(opts, async () => {
          const { version } = variables || {};
          const resourceText = await metaHandler(version);
          const updatedText = isPlainObject(resourceText) ? JSON.stringify(resourceText, null, 2) : resourceText;

          return {
            contents: [
              {
                uri: passedUri?.toString(),
                mimeType: metaMimeType,
                text: updatedText
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

    // Add the meta-resource enhancement to the existing resource
    const enhancedResource = (opts = options): McpResource => {
      const metaEnhancedCallback: McpResource[3] = async (passedUri, variables) =>
        runWithOptions(opts, async () => {
          const result = await callback(passedUri, variables);
          const { version } = variables || {};

          if (result.contents) {
            const resourceText = await metaHandler(version);
            const updatedText = isPlainObject(resourceText) ? JSON.stringify(resourceText, null, 2) : resourceText;

            result.contents.push({
              uri: `${uriBreakdown.baseUri}${version ? `?version=${version}` : ''}`,
              mimeType: metaMimeType,
              text: updatedText
            });
          }

          return result;
        });

      return [name, uriOrTemplate, config, metaEnhancedCallback, metadata];
    };

    // Add the resources back in
    updatedResources.push(metaResource);
    updatedResources.push(enhancedResource);
  });

  return updatedResources;
};

export { generateMetaContent, generateMarkdownTable, getUriVariations, setMetaHandler, setMetaResources };

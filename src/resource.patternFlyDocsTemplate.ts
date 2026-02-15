import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { stringJoin } from './server.helpers';
import { memo } from './server.caching';
import { getOptions, runWithOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpDocs } from './patternFly.getResources';
import {
  filterEnumeratedPatternFlyVersions,
  normalizeEnumeratedPatternFlyVersion
} from './patternFly.helpers';

/**
 * List resources result type.
 *
 * @note This is temporary until MCP SDK exports ListResourcesResult.
 *
 * @property uri - The fully qualified URI of the resource.
 * @property name - A human-readable name for the resource.
 * @property [mimeType] - The MIME type of the content.
 * @property [description] - A brief hint for the model.
 */
type PatterFlyDocsListResourceResult = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
};

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{version}/{name}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Page',
  description: 'Retrieve specific PatternFly documentation by name or path',
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template.
 *
 * @returns {Promise<PatterFlyDocsListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { byVersion } = await getPatternFlyMcpDocs.memo();

  const resources: PatterFlyDocsListResourceResult[] = [];

  // Initial sort by the latest version
  Object.entries(byVersion).sort(([a], [b]) => b.localeCompare(a)).forEach(([version, entries]) => {
    const seenIndex = new Set<string>();
    const versionResource: PatterFlyDocsListResourceResult[] = [];

    entries.forEach(entry => {
      if (!seenIndex.has(entry.name)) {
        seenIndex.add(entry.name);

        versionResource.push({
          uri: `patternfly://docs/${version}/${entry.name.toLowerCase()}`,
          mimeType: 'text/markdown',
          name: `${entry.name} (${version})`,
          description: `Documentation for PatternFly version "${version}" of "${entry.name}"`
        });
      }
    });

    resources.push(...versionResource);
  });

  return {
    resources
  };
};

listResources.memo = memo(listResources);

/**
 * Name completion callback for the URI template.
 *
 * @param value - The value to complete.
 * @returns The list of available versions.
 */
const uriVersionComplete: CompleteResourceTemplateCallback = async (value: unknown) =>
  filterEnumeratedPatternFlyVersions(value as string | undefined);

/**
 * Name completion callback for the URI template.
 *
 * @note If version is not available, the latest version is used to refine the search results
 * since it aligns with the default behavior of the PatternFly documentation.
 *
 * @param value - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: CompleteResourceTemplateCallback = async (value: unknown, context) => {
  const { latestVersion, byVersion } = await getPatternFlyMcpDocs.memo();
  const version = context?.arguments?.version;
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;
  const updatedValue = typeof value === 'string' ? value.toLowerCase().trim() : '';

  return byVersion[updatedVersion]?.filter(entry => entry.name.toLowerCase().startsWith(updatedValue))
    .map(entry => entry.name) as string[];
};

/**
 * Resource callback for the documentation template.
 *
 * @param uri - The URI of the resource.
 * @param variables - The variables of the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (uri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { version, name } = variables || {};

  if (!name || typeof name !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing required parameter: name must be a string: ${name}`
    );
  }

  if (name.length > options.maxSearchLength) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Resource name exceeds maximum length of ${options.maxSearchLength} characters.`
    );
  }

  const { latestVersion } = await getPatternFlyMcpDocs.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;

  const docResults = [];
  const docs = [];
  const { searchResults, exactMatches } = await searchPatternFly.memo(name);

  if (exactMatches.length === 0 ||
    exactMatches.every(match => !match.versions[updatedVersion]?.urls.length)
  ) {
    const suggestions = searchResults.map(result => result.item).slice(0, 3);
    const suggestionMessage = suggestions.length
      ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
      : 'No similar resources found.';

    throw new McpError(
      ErrorCode.InvalidParams,
      `No documentation found for "${name.trim()}". ${suggestionMessage}`
    );
  }

  try {
    const exactMatchesUrls = exactMatches.flatMap(match => match.versions[updatedVersion]?.urls).filter(Boolean) as string[];

    if (exactMatchesUrls.length > 0) {
      const processedDocs = await processDocsFunction.memo(exactMatchesUrls);

      docs.push(...processedDocs);
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to fetch documentation: ${error}`
    );
  }

  // Redundancy check, technically this should never happen, future proofing
  if (docs.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `"${name.trim()}" was found, but no documentation URLs are available for it.`
    );
  }

  for (const doc of docs) {
    docResults.push(stringJoin.newline(
      `# Documentation from ${doc.resolvedPath || doc.path}`,
      '',
      doc.content
    ));
  }

  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text: docResults.join(options.separator)
      }
    ]
  };
};

/**
 * Resource creator for the documentation template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args)),
      name: async (...args) => runWithOptions(options, async () => uriNameComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlyDocsTemplateResource,
  listResources,
  resourceCallback,
  uriVersionComplete,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

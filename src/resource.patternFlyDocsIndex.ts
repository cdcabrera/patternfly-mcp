import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { memo } from './server.caching';
import { assertInput, assertInputStringLength } from './server.assertions';
import { buildSearchString } from './server.helpers';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { getOptions, runWithOptions } from './options.context';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { filterPatternFly } from './patternFly.search';

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
type PatterFlyListResourceResult = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
};

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/index{?version,section,category}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: 'A comprehensive list of PatternFly documentation links, organized by components, layouts, charts, and guidance files.',
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template.
 *
 * @returns {Promise<PatterFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { availableVersions, byVersion } = await getPatternFlyMcpResources.memo();
  const resources: PatterFlyListResourceResult[] = [];

  Object.entries(byVersion)
    .filter(([version]) => availableVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version, entries]) => {
      const seenIndex = new Set<string>();
      const versionResource: PatterFlyListResourceResult[] = [];

      entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(entry => {
          if (!seenIndex.has(entry.name)) {
            seenIndex.add(entry.name);

            versionResource.push({
              uri: entry.uri,
              mimeType: 'text/markdown',
              name: `${entry.name} (${version})`,
              description: `Documentation for PatternFly version "${version}" of "${entry.name}"`
            });
          }
        });

      resources.push(...versionResource);
    });

  return {
    resources: resources.sort((a, b) => a.name.localeCompare(b.name))
  };
};

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { category, version, section } = variables || {};

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'version'
    });
  }

  if (category) {
    assertInputStringLength(category, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'category'
    });
  }

  if (section) {
    assertInputStringLength(section, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'section'
    });
  }

  const { availableVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version && !normalizedVersion,
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestVersion;

  const { byEntry } = await filterPatternFly.memo({
    version: updatedVersion,
    category,
    section
  });

  // Group by URI
  const groupedByUri = new Map<string, { name: string, version: string, categories: Set<string> }>();

  byEntry.forEach(entry => {
    if (!groupedByUri.has(entry.uri)) {
      groupedByUri.set(entry.uri, {
        name: entry.name,
        version: entry.version,
        categories: new Set([entry.displayCategory])
      });
    } else {
      groupedByUri.get(entry.uri)?.categories.add(entry.displayCategory);
    }
  });

  // Generate the consolidated list, apply search/query string
  const docsIndex = Array.from(groupedByUri.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([uri, data], index) => {
      const categoryList = Array.from(data.categories).join(', ');
      const searchString = buildSearchString({ section, category }, { prefix: true });

      return `${index + 1}. [${data.name} - ${categoryList} (${data.version})](${uri}${searchString || ''})`;
    });

  assertInput(
    docsIndex.length > 0,
    () => {
      let suggestionMessage = '';

      if (category || section) {
        const variableList = [
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(' or ');

        suggestionMessage = ` Try using a different ${variableList} search.`;
      }

      return `No documentation found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  const allDocs = stringJoin.newline(
    `# PatternFly Documentation Index for "${updatedVersion}"`,
    '',
    '',
    ...(docsIndex || [])
  );

  return {
    contents: [
      {
        uri: passedUri?.toString() || 'patternfly://docs/index',
        mimeType: 'text/markdown',
        text: allDocs
      }
    ]
  };
};

/**
 * Resource creator for the documentation index.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo())
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlyDocsIndexResource,
  listResources,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG,
  type PatterFlyListResourceResult
};

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { memo } from './server.caching';
import { buildSearchString, stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { filterPatternFly } from './patternFly.search';
import { uriCategoryComplete, uriVersionComplete, type PatterFlyListResourceResult } from './resource.patternFlyDocsIndex';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-components-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://components/index{?version,category}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Components Index',
  description: 'A list of all PatternFly component names available for documentation retrieval',
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template.
 *
 * @note We use "byVersionComponentNames" instead of "byVersion" because it's specific to components.
 * Docs resources don't necessarily contain all components.
 *
 * @returns {Promise<PatterFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { availableVersions, byVersionComponentNames } = await getPatternFlyMcpResources.memo();
  const resources: PatterFlyListResourceResult[] = [];

  Array.from(byVersionComponentNames)
    .filter(([version]) => availableVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version, components]) => {
      const versionResource: PatterFlyListResourceResult[] = [];

      Object.entries(components)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([name, component]) => {
          const displayName = component.displayName;
          const isSchemasAvailable = component.isSchemasAvailable || false;

          versionResource.push({
            uri: `patternfly://docs/${version}/${name}`,
            mimeType: 'text/markdown',
            name: `${displayName} (${version})`,
            description: `Component documentation for PatternFly version "${version}" of "${displayName}.${isSchemasAvailable ? ' (JSON Schema available)' : ''}"`
          });
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
 * @param options - Options for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { version, category } = variables || {};
  const section = 'components';

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

  const { availableVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version && !normalizedVersion,
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestVersion;
  const { byResource } = await filterPatternFly.memo({ version: updatedVersion, section, category });

  const docsIndex = Array.from(byResource.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([_name, data], index) => {
      const searchString = buildSearchString({
        version: updatedVersion,
        category
      }, { prefix: true });

      return `${index + 1}. [${data.name} (${updatedVersion})](${data.uri}${searchString || ''})`;
    });

  return {
    contents: [{
      uri: passedUri?.toString() || 'patternfly://components/index',
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Component Names Index for "${updatedVersion}"`,
        '',
        '',
        ...docsIndex || []
      )
    }]
  };
};

/**
 * Resource creator for the component schemas index.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyComponentsIndexResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      category: async (...args) => runWithOptions(options, async () => uriCategoryComplete(...args)),
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables))
];

export {
  patternFlyComponentsIndexResource,
  listResources,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

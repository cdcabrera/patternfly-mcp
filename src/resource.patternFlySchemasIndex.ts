import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { type PatterFlyListResourceResult } from './resource.patternFlyDocsIndex';
import {
  getPatternFlyVersionContext,
  normalizeEnumeratedPatternFlyVersion
} from './patternFly.helpers';
import { filterPatternFly } from './patternFly.search';
import { assertInput, assertInputStringLength } from './server.assertions';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-schemas-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/index{?version}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schemas Index',
  description: 'A list of all PatternFly component names available for JSON Schema retrieval',
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template.
 *
 * @returns {Promise<PatterFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { availableSchemasVersions, byVersionComponentNames } = await getPatternFlyMcpResources.memo();
  const resources: PatterFlyListResourceResult[] = [];

  Array.from(byVersionComponentNames)
    .filter(([version]) => availableSchemasVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version, components]) => {
      const versionResource: PatterFlyListResourceResult[] = [];

      Object.entries(components)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([name, component]) => {
          const displayName = component.displayName;
          const isSchemasAvailable = component.isSchemasAvailable || false;

          if (isSchemasAvailable) {
            versionResource.push({
              uri: `patternfly://schemas/${version}/${name}`,
              mimeType: 'application/json',
              name: `${displayName} (${version})`,
              description: `JSON component schemas for PatternFly version "${version}" of "${displayName}"`
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
 * Name completion callback for the URI schemas template.
 *
 * @note Schemas has limited version support.
 *
 * @param value - The value to complete.
 * @returns The list of available versions, or an empty list.
 */
const uriVersionComplete: CompleteResourceTemplateCallback = async (value: unknown) => {
  const { availableSchemasVersions } = await getPatternFlyVersionContext.memo();
  let normalizedVersion = typeof value === 'string' ? value.trim().toLowerCase() : undefined;

  if (!normalizedVersion) {
    return availableSchemasVersions;
  }

  normalizedVersion = await normalizeEnumeratedPatternFlyVersion(normalizedVersion);

  return availableSchemasVersions.filter(version => normalizedVersion === version);
};

/**
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Options for the resource callback.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { version } = variables || {};

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'version'
    });
  }

  const { availableSchemasVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;

  let docsIndex: string[] = [];

  if (availableSchemasVersions.includes(updatedVersion)) {
    const { byResource } = await filterPatternFly.memo({
      version: updatedVersion
    });

    const groupedByUri = new Map<string, { name: string, version: string }>();

    byResource.forEach(resource => {
      if (resource.uriSchemas) {
        groupedByUri.set(resource.uriSchemas, { name: resource.name, version: updatedVersion });
      }
    });

    docsIndex = Array.from(groupedByUri.entries())
      .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
      .map(([uri, data], index) => `${index + 1}. [${data.name} (${data.version})](${uri})`);
  }

  assertInput(
    docsIndex.length > 0,
    () => {
      let suggestionMessage = '';

      if (!availableSchemasVersions.includes(updatedVersion)) {
        suggestionMessage = ` Component schemas are only available for PatternFly versions ${availableSchemasVersions.join(', ')}`;
      }

      return `No component JSON schemas found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  return {
    contents: [{
      uri: passedUri?.toString(),
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Component JSON Schemas Index for "${updatedVersion}"`,
        '',
        '',
        ...docsIndex
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
const patternFlySchemasIndexResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlySchemasIndexResource,
  listResources,
  resourceCallback,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

import {
  type CompleteResourceTemplateCallback,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { type PatterFlyListResourceResult } from './resource.patternFlyDocsIndex';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

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
  const { availableSchemasVersions, byVersion, resources: docsResources } = await getPatternFlyMcpResources.memo();

  const resources: PatterFlyListResourceResult[] = [];

  availableSchemasVersions.forEach(version => {
    const versionEntries = byVersion[version] || [];
    const versionResource: PatterFlyListResourceResult[] = [];
    const seenIndex = new Set<string>();

    versionEntries.forEach(entry => {
      const entryName = entry.name.toLowerCase();

      if (!seenIndex.has(entryName) && docsResources.get(entryName)?.versions?.[version]?.isSchemasAvailable) {
        seenIndex.add(entryName);

        resources.push({
          uri: `patternfly://schemas/${version}/${entryName}`,
          mimeType: 'application/json',
          name: `${entry.name} (${version})`,
          description: `JSON component schemas for PatternFly version "${version}" of "${entry.name}"`
        });
      }
    });

    resources.push(...versionResource);
  });

  return {
    resources
  };
};

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * Name completion callback for the URI template.
 *
 * @note Currently component schemas are limited to `v6` so they receive a
 * custom available version index.
 *
 * @param _value - The value to complete.
 * @returns The list of available versions.
 */
const uriVersionComplete: CompleteResourceTemplateCallback = async (_value: unknown) => {
  const { availableSchemasVersions } = await getPatternFlyMcpResources.memo();

  return availableSchemasVersions;
};

/**
 * Resource callback for the documentation index.
 *
 * @param uri - URI of the resource.
 * @param variables - Variables for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (uri: URL, variables: Record<string, string>) => {
  const { version } = variables || {};

  const { latestVersion, byVersion, resources } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;

  const entries = byVersion[updatedVersion] || [];

  // Group by URI
  const groupedByUri = new Map<string, { name: string, version: string }>();

  entries.forEach(entry => {
    const entryName = entry.name.toLowerCase();
    const resource = resources.get(entryName)?.versions[updatedVersion];

    if (resource?.uriSchemas) {
      groupedByUri.set(resource.uriSchemas, { name: entry.name, version: entry.version });
    }
  });

  // Generate the consolidated list
  const docsIndex = Array.from(groupedByUri.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([uri, data], index) => `${index + 1}. [${data.name} (${data.version})](${uri})`);

  return {
    contents: [{
      uri: 'patternfly://schemas/index',
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Component JSON Schemas Index for "${updatedVersion}"`,
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
const patternFlySchemasIndexResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables))
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

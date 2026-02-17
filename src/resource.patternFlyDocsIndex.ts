import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { memo } from './server.caching';
import { getPatternFlyMcpDocs } from './patternFly.getResources';
import { getOptions, runWithOptions } from './options.context';
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
const URI_TEMPLATE = 'patternfly://docs/index{?version}';

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
  const { byVersion } = await getPatternFlyMcpDocs.memo();

  const resources: PatterFlyListResourceResult[] = [];

  // Initial sort by the latest version
  Object.entries(byVersion).sort(([a], [b]) => b.localeCompare(a)).forEach(([version, entries]) => {
    const seenIndex = new Set<string>();
    const versionResource: PatterFlyListResourceResult[] = [];

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
 * Resource callback for the documentation index.
 *
 * @param uri - URI of the resource.
 * @param variables - Variables for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (uri: URL, variables: Record<string, string>) => {
  const { version } = variables || {};
  let updatedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  if (!updatedVersion) {
    const { latestVersion } = await getPatternFlyMcpDocs.memo();

    updatedVersion = latestVersion;
  }

  const { byVersion } = await getPatternFlyMcpDocs.memo();
  // const docsIndex = byVersion[updatedVersion]?.map((item, index) =>
  //  `${index + 1}. [${item.name} - ${item.displayCategory} (${item.version})](${item.uri})`);

  // `1. [AboutModal - Design Guidelines, Accessibility, Examples (v6)](patternfly://docs/v6/aboutmodal)`

  const entries = byVersion[updatedVersion] || [];

  // Group categories by URI
  const groupedByUri = new Map<string, { name: string, version: string, categories: string[] }>();

  entries.forEach(item => {
    if (!groupedByUri.has(item.uri)) {
      groupedByUri.set(item.uri, {
        name: item.name,
        version: item.version,
        categories: [item.displayCategory]
      });
    } else {
      groupedByUri.get(item.uri)?.categories.push(item.displayCategory);
    }
  });

  // Generate the consolidated list
  const docsIndex = Array.from(groupedByUri.entries()).map(([uri, data], index) => {
    const categoryList = data.categories.join(', ');

    return `${index + 1}. [${data.name} - ${categoryList} (${data.version})](${uri})`;
  });

  const allDocs = stringJoin.newline(
    `# PatternFly Documentation Index for "${updatedVersion}"`,
    '',
    '',
    ...(docsIndex || [])
  );

  return {
    contents: [
      {
        uri: 'patternfly://docs/index',
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
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables))
];

export {
  patternFlyDocsIndexResource,
  listResources,
  resourceCallback,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG,
  type PatterFlyListResourceResult
};

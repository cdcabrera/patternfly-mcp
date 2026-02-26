import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { memo } from './server.caching';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { getOptions, runWithOptions } from './options.context';
import {
  getPatternFlyVersionContext,
  normalizeEnumeratedPatternFlyVersion
} from './patternFly.helpers';
import { assertInputStringLength } from './server.assertions';
import { buildSearchString } from './server.helpers';

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
  const { byVersion } = await getPatternFlyMcpResources.memo();
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

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * Category completion callback for the URI template.
 *
 * @param value - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available categories, or an empty list.
 */
const uriCategoryComplete: CompleteResourceTemplateCallback = async (value: unknown, context) => {
  const { version, section } = context?.arguments || {};
  const normalizedValue = typeof value === 'string' ? value?.trim()?.toLowerCase() : '';
  const normalizedSection = typeof section === 'string' ? section?.trim()?.toLowerCase() : undefined;

  const { latestVersion, byVersion } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;

  const entries = byVersion[updatedVersion] || [];
  const availableCategories = new Set<string>();

  entries.forEach(entry => {
    if (normalizedSection && entry.section.toLowerCase() === normalizedSection) {
      availableCategories.add(entry.category);

      return;
    }

    availableCategories.add(entry.category);
  });

  return Array
    .from(availableCategories)
    .sort()
    .filter(category => normalizedValue === category || category.startsWith(normalizedValue) || category.endsWith(normalizedValue));
};

/**
 * Section completion callback for the URI template.
 *
 * @param value - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available sections, or an empty list.
 */
const uriSectionComplete: CompleteResourceTemplateCallback = async (value: unknown, context) => {
  const { version, category } = context?.arguments || {};
  const normalizedValue = typeof value === 'string' ? value?.trim()?.toLowerCase() : '';
  const normalizedCategory = typeof category === 'string' ? category?.trim()?.toLowerCase() : undefined;

  const { latestVersion, byVersion } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;

  const entries = byVersion[updatedVersion] || [];
  const availableSections = new Set<string>();

  entries.forEach(entry => {
    if (normalizedCategory && entry.category.toLowerCase() === normalizedCategory) {
      availableSections.add(entry.section);

      return;
    }

    availableSections.add(entry.section);
  });

  return Array
    .from(availableSections)
    .sort()
    .filter(section => normalizedValue === section || section.startsWith(normalizedValue) || section.endsWith(normalizedValue));
};

/**
 * Name completion callback for the URI template.
 *
 * @param value - The value to complete.
 * @returns The list of available versions, or an empty list.
 */
const uriVersionComplete: CompleteResourceTemplateCallback = async (value: unknown) => {
  const { enumeratedVersions } = await getPatternFlyVersionContext.memo();
  const normalizedVersion = typeof value === 'string' ? value.trim().toLowerCase() : '';

  return enumeratedVersions
    .filter(enumeratedVersion =>
      normalizedVersion === enumeratedVersion ||
      enumeratedVersion.startsWith(normalizedVersion) ||
      enumeratedVersion.endsWith(normalizedVersion));
};

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

  const { latestVersion, byVersion } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;
  let entries = byVersion[updatedVersion] || [];
  let normalizedCategory: string | undefined;
  let normalizedSection: string | undefined;

  if (section) {
    assertInputStringLength(section, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'section'
    });

    normalizedSection = section.trim().toLowerCase();
  }

  if (category) {
    assertInputStringLength(category, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'category'
    });

    normalizedCategory = category.trim().toLowerCase();
  }

  // Apply category and section filtering
  if (normalizedCategory || normalizedSection) {
    entries = entries.filter(entry => {
      const matchesCategory = entry.category.toLowerCase() === normalizedCategory;
      const matchesSection = entry.section.toLowerCase() === normalizedSection;

      if (normalizedCategory && normalizedSection) {
        return matchesCategory && matchesSection;
      } else {
        return matchesCategory || matchesSection;
      }
    });
  }

  // Group by URI
  const groupedByUri = new Map<string, { name: string, version: string, categories: Set<string> }>();

  entries.forEach(item => {
    if (!groupedByUri.has(item.uri)) {
      groupedByUri.set(item.uri, {
        name: item.name,
        version: item.version,
        categories: new Set([item.displayCategory])
      });
    } else {
      groupedByUri.get(item.uri)?.categories.add(item.displayCategory);
    }
  });

  // Generate the consolidated list, apply search/query string
  const docsIndex = Array.from(groupedByUri.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([uri, data], index) => {
      const categoryList = Array.from(data.categories).join(', ');
      let searchString;

      if (normalizedCategory || normalizedSection) {
        searchString = buildSearchString({
          section: normalizedSection,
          category: normalizedCategory
        }, { prefix: true });
      }

      /*
      const buildQuery = [];

      if (normalizedCategory || normalizedSection) {
        const sectionQuery = normalizedSection ? `section=${normalizedSection}` : '';
        const categoryQuery = normalizedCategory ? `category=${normalizedCategory}` : '';

        buildQuery.push(categoryQuery, sectionQuery);
      }*/

      return `${index + 1}. [${data.name} - ${categoryList} (${data.version})](${uri}${searchString || ''})`;
      // return `${index + 1}. [${data.name} - ${categoryList} (${data.version})](${uri}${buildQuery.length ? `?${buildQuery.filter(Boolean).join('&')}` : ''})`;
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
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      category: async (...args) => runWithOptions(options, async () => uriCategoryComplete(...args)),
      section: async (...args) => runWithOptions(options, async () => uriSectionComplete(...args)),
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlyDocsIndexResource,
  listResources,
  resourceCallback,
  uriCategoryComplete,
  uriSectionComplete,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG,
  type PatterFlyListResourceResult
};

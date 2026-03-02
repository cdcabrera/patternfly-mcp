import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import {
  listResources,
  uriCategoryComplete,
  uriNameComplete,
  uriSectionComplete,
  uriVersionComplete
} from './resource.patternFlyDocsIndex';
import { filterPatternFly } from './patternFly.search';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{version}/{name}{?section,category}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Page',
  description: 'Retrieve specific PatternFly documentation by name or path',
  mimeType: 'text/markdown'
};

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
/*
const disabled_uriNameComplete: ExtendedCompleteResourceTemplateCallback = async (value: unknown, context) => {
  const { latestVersion, byVersion } = await getPatternFlyMcpResources.memo();
  const version = context?.arguments?.version;
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;
  const updatedValue = typeof value === 'string' ? value.toLowerCase().trim() : '';
  const names = new Set<string>();

  byVersion[updatedVersion]?.filter(entry => entry.name.toLowerCase().startsWith(updatedValue))
    .forEach(entry => names.add(entry.name));

  return Array.from(names).sort();
};

/**
 * Memoized version of uriNameComplete.
 */
// disabled_uriNameComplete.memo = memo(disabled_uriNameComplete);

/**
 * Resource callback for the documentation template.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { category, name, section, version } = variables || {};

  assertInputStringLength(version, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'version'
  });

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

  if (section) {
    assertInputStringLength(section, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'section'
    });
  }

  if (category) {
    assertInputStringLength(category, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'category'
    });
  }

  const { latestVersion } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;
  const updatedName = name.trim();

  const { byEntry } = await filterPatternFly.memo({
    version: updatedVersion,
    name: updatedName,
    category,
    section
  });

  const docResults = [];
  const docs = [];

  try {
    const matchedUrls = byEntry.map(entry => entry.path).filter(Boolean);

    if (matchedUrls.length > 0) {
      const processedDocs = await processDocsFunction.memo(matchedUrls);

      docs.push(...processedDocs);
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to fetch documentation: ${error}`
    );
  }

  assertInput(
    docs.length > 0,
    () => {
      let suggestionMessage = '';

      if (category || section) {
        const variableList = [
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(' or ');

        suggestionMessage = ` Try using a different ${variableList} search.`;
      }

      return `"${updatedName}" was found, but no documentation URLs are available for it.${suggestionMessage}`;
    }
  );

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
        uri: passedUri?.toString() || `patternfly://docs/${updatedVersion}/${updatedName}`,
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
      category: async (...args) => runWithOptions(options, async () => uriCategoryComplete(...args)),
      name: async (...args) => runWithOptions(options, async () => uriNameComplete(...args)),
      section: async (...args) => runWithOptions(options, async () => uriSectionComplete(...args)),
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlyDocsTemplateResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

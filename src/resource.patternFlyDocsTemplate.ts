import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { listResources, uriVersionComplete } from './resource.patternFlyDocsIndex';
import { assertInput, assertInputString, assertInputStringLength } from './server.assertions';
import { memo } from './server.caching';

/**
 * Extended callback type that combines the `CompleteResourceTemplateCallback` type
 * and an additional `memo` property.
 *
 * @extends CompleteResourceTemplateCallback
 */
type ExtendedCompleteResourceTemplateCallback = { memo: CompleteResourceTemplateCallback } & CompleteResourceTemplateCallback;

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
const uriNameComplete: ExtendedCompleteResourceTemplateCallback = async (value: unknown, context) => {
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
uriNameComplete.memo = memo(uriNameComplete);

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

  const updatedName = (await uriNameComplete.memo(name, { arguments: { version } }))?.[0];

  assertInputString(
    updatedName,
    { inputDisplayName: 'name' }
  );

  const { latestVersion, resources } = await getPatternFlyMcpResources.memo();
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;
  const resourceEntries = resources.get(updatedName.toLowerCase())?.versions?.[updatedVersion]?.entries || [];

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

  let updatedResourceEntries = resourceEntries;

  if (normalizedCategory || normalizedSection) {
    updatedResourceEntries = resourceEntries.filter(entry => {
      const matchesCategory = entry.category.toLowerCase() === normalizedCategory;
      const matchesSection = entry.section.toLowerCase() === normalizedSection;

      if (normalizedCategory && normalizedSection) {
        return matchesCategory && matchesSection;
      } else {
        return matchesCategory || matchesSection;
      }
    });
  }

  // const { exactMatches, remainingMatches } = await searchPatternFly.memo(updatedName);
  // const updatedName =

  /*
  assertInput(
    Boolean(exactMatches.length) && exactMatches.every(match => Boolean(match.versions[updatedVersion]?.urls.length)),
    () => {
      const isSchemasAvailable = resources.get(updatedName.toLowerCase())?.versions?.[updatedVersion]?.isSchemasAvailable;
      let suggestionMessage;

      if (isSchemasAvailable) {
        suggestionMessage =
          `A JSON Schema is available. Use "patternfly://schemas/${updatedVersion}/${updatedName.toLowerCase()}" to view prop definitions."`;
      } else {
        const suggestions = remainingMatches.map(result => result.name).slice(0, 3);

        suggestionMessage = suggestions.length
          ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
          : 'No similar resources found.';
      }

      return `No documentation found for "${updatedName}". ${suggestionMessage}`;
    },
    ErrorCode.InvalidParams
  );
   */

  const docResults = [];
  const docs = [];

  try {
    // const exactMatchesUrls = exactMatches.flatMap(match => match.versions[updatedVersion]?.urls).filter(Boolean) as string[];
    const matchedUrls = updatedResourceEntries.map(entry => entry.path).filter(Boolean);

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

      if (normalizedCategory || normalizedSection) {
        const variableList = [
          (normalizedCategory && 'category') || undefined,
          (normalizedSection && 'section') || undefined
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
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args)),
      name: async (...args) => runWithOptions(options, async () => uriNameComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlyDocsTemplateResource,
  resourceCallback,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

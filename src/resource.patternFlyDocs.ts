import {
  ResourceTemplate,
  type ListResourcesCallback,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './mcpSdk';
import { memo } from './server.caching';
import { assertInput, assertInputStringLength, assertInputStringShaHex } from './server.assertions';
import { findClosest } from './server.search';
import { processDocsFunction } from './server.getResources';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { filterPatternFly } from './patternFly.search';
import { isShaHexLike } from './server.helpers';
import {
  formatSummaryFullContent,
  nextCursor,
  paramCompletion
} from './resource.helpers';

/**
 * Extended callback type that combines the `CompleteResourceTemplateCallback` type
 * and an additional `memo` property.
 *
 * @extends CompleteResourceTemplateCallback
 */
type ExtendedCompleteResourceTemplateCallback = { memo: CompleteResourceTemplateCallback } & CompleteResourceTemplateCallback;

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
type PatternFlyListResourceResult = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
};

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{name}{?id,detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly name, ID, or detail. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: `A list of PatternFly documentation links including accessibility, components, charts, development, writing, and AI guidance files. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown',
  annotations: {
    priority: 1.0,
    audience: ['assistant' as const]
  }
};

/**
 * Index list. List resources callback for the URI template.
 *
 * @note It's important to keep lists focused and concise, use paging to avoid
 * listing all resources.
 *
 * @param _extra
 * @param cursor - The passed back cursor/page for pagination.
 * @returns {Promise<PatternFlyListResourceResult>} The list of available resources.
 */
const listResources = async (_extra: unknown, cursor?: string | undefined) => {
  const pageSize = 15;
  const { versionIndex } = await getPatternFlyMcpResources.memo();
  const { start, end, next } = nextCursor({ cursor, pageSize, size: versionIndex.length });
  const resources: PatternFlyListResourceResult[] = [];

  versionIndex.slice(start, end).forEach((entry, index) => {
    const actualIndex = start + index + 1;

    resources.push({
      uri: entry.uriId,
      name: `${entry.displayName} - ${entry.displayCategory} (${entry.version}) (${actualIndex}/${versionIndex.length} resources)`,
      description: entry.description,
      mimeType: 'text/markdown'
    });
  });

  return {
    totalCount: versionIndex.length,
    pageSize,
    nextCursor: next,
    resources
  };
};

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * Detail completion callback for the URI template.
 *
 * @param detail - The value to complete.
 * @returns The list of available details.
 */
const uriDetailComplete: ExtendedCompleteResourceTemplateCallback = async (detail: string) => {
  const levels = ['summary', 'full'];
  const closest = findClosest.memo(detail, levels) as string | undefined;

  return closest ? [closest] : [];
};

/**
 * Memoized version of uriDetailComplete.
 */
uriDetailComplete.memo = memo(uriDetailComplete);

/**
 * Name completion callback for the URI template.
 *
 * @note If version is not available, the latest version is used to refine the search results
 * since it aligns with the default behavior of the PatternFly documentation.
 *
 * @param name - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: ExtendedCompleteResourceTemplateCallback = async (name: string, context) => {
  const { id } = context?.arguments || {};

  if (isShaHexLike(id)) {
    return [];
  }

  const { names } = await paramCompletion({ name, id });

  return names;
};

/**
 * Memoized version of uriNameComplete.
 */
uriNameComplete.memo = memo(uriNameComplete);

/**
 * ID completion callback for the URI template.
 *
 * @param id - The value to complete.
 * @param context - The completion context.
 * @returns The list of available IDs.
 */
const uriIdComplete: ExtendedCompleteResourceTemplateCallback = async (id: string, context) => {
  const { name } = context?.arguments || {};

  if (isShaHexLike(name)) {
    return [];
  }

  const { ids } = await paramCompletion({ name, id });

  return ids;
};

/**
 * Memoized version of uriIdComplete.
 */
uriIdComplete.memo = memo(uriIdComplete);

/**
 * Return content. Resource callback for the documentation template.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { detail = 'summary', name, id } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['full', 'summary']) || detail) as 'full' | 'summary';
  const isNameHash = isShaHexLike(name);
  const isIdHash = isShaHexLike(id);
  const isTerminalId = isNameHash || isIdHash;
  let updatedId: string | undefined;

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

  if (id) {
    assertInputStringShaHex(id, {
      ...options.minMax.sha1Hex,
      inputDisplayName: 'id'
    });

    // Be lenient, only apply the ID if it's different from name.
    if (id !== name) {
      updatedId = id;
    }
  }

  const {
    latestVersion
  } = await getPatternFlyMcpResources.memo();

  if (isTerminalId) {
    updatedId = (isIdHash ? id : name) as string;
  }

  const updatedVersion = latestVersion;
  const updatedName = isTerminalId ? undefined : (name as string).trim();

  const { byEntry } = await filterPatternFly.memo({
    id: updatedId,
    version: updatedId ? undefined : latestVersion,
    name: updatedName
  });

  assertInput(
    byEntry.length > 0,
    () => {
      let suggestionMessage = '';

      if (id) {
        suggestionMessage = ' Try using a different ID.';
      }

      return `No documentation found for "${updatedName || updatedId}".${suggestionMessage}`;
    }
  );

  const docs = [];

  try {
    const docPaths = byEntry
      .filter(({ path }) => path)
      .map(({ path, uriId }) => ({ doc: path, uri: uriId }));

    if (docPaths.length > 0) {
      // `processDocsFunction` has de-dup docs baked in
      const processedDocs = await processDocsFunction.memo(docPaths);

      // Failures are `log.debugged` in `processDocsFunction`.
      for (const response of processedDocs) {
        if (response.isSuccess) {
          docs.push({
            ...response
          });
        }
      }
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to fetch documentation: ${error}`
    );
  }

  assertInput(
    docs.length > 0,
    () => `"${updatedName}" was found, but no documentation resources are available for it.`
  );

  return {
    contents: docs.map(({ uri, path, resolvedPath, content }) => ({
      uri,
      mimeType: 'text/markdown',
      text: formatSummaryFullContent(content, {
        url: uri,
        detailType: normalizedDetail,
        frontMatter: {
          document: resolvedPath || path,
          name: updatedName,
          version: updatedVersion
        }
      })
    }))
  };
};

/**
 * Resource creator for the documentation index and metadata resources.
 *
 * @note The `metaConfig` determines if a metadata resource is generated. Remove
 * the config to disable it.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsResource = (options = getOptions()): McpResource => {
  const list: ListResourcesCallback = async (...args) => runWithOptions(options, async () => listResources.memo(...args));

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    name: async (...args) => runWithOptions(options, async () => uriNameComplete.memo(...args)),
    id: async (...args) => runWithOptions(options, async () => uriIdComplete.memo(...args)),
    detail: async (...args) => runWithOptions(options, async () => uriDetailComplete.memo(...args))
  };

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback(uri, variables, options));

  return [
    NAME,
    new ResourceTemplate(URI_TEMPLATE, {
      list,
      complete
    }),
    CONFIG,
    callback,
    {
      complete,
      registerAllSearchCombinations: true,
      indexConfig: {
        uri: 'patternfly://docs/index{?version}'
      },
      metaConfig: {
        uri: 'patternfly://docs/meta{?version}',
        title: `${CONFIG.title} Metadata`,
        description: 'Use these parameters to filter the PatternFly documentation index.'
      }
    },
    {
      shouldRegister: opts => opts.contextManagement === true
    }
  ];
};

export {
  patternFlyDocsResource,
  listResources,
  resourceCallback,
  uriDetailComplete,
  uriIdComplete,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG,
  type ExtendedCompleteResourceTemplateCallback,
  type PatternFlyListResourceResult
};

import {
  ResourceTemplate,
  type ListResourcesCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  type McpResource,
  type McpResourceListResult,
  type McpResourceMetadataComplete,
  type McpResourceMetadataCompleteMemo
} from './mcpSdk';
import { memo } from './server.caching';
import { assertInput, assertInputStringLength } from './server.assertions';
import { findClosest } from './server.search';
import { processDocsFunction } from './server.getResources';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyContextManagementResources } from './patternFly.getResources';
import { filterPatternFlyContext } from './patternFly.search';
import { formatSummaryFullContent, nextCursor } from './resource.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{id}{?detail}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly ID and detail. ${URI_TEMPLATE}`;

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
 * @returns The list of available resources.
 */
const listResources = async (_extra: unknown, cursor?: string | undefined) => {
  const pageSize = 15;
  const { versionIndex } = await getPatternFlyContextManagementResources.memo();
  const terminalDocs = versionIndex.filter(record => !record.isCollection);
  const { start, end, next } = nextCursor({ cursor, pageSize, size: terminalDocs.length });
  const resources: McpResourceListResult[] = [];

  terminalDocs.slice(start, end).forEach((entry, index) => {
    const actualIndex = start + index + 1;

    resources.push({
      uri: entry.uri as string,
      name: `${entry.displayName} (${actualIndex}/${terminalDocs.length})`,
      description: entry.description,
      mimeType: 'text/markdown'
    });
  });

  return {
    totalCount: terminalDocs.length,
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
const uriDetailComplete: McpResourceMetadataCompleteMemo = async (detail: string) => {
  const levels = ['summary', 'full'];
  const closest = findClosest.memo(detail, levels) as string | undefined;

  return closest ? [closest] : [];
};

/**
 * Memoized version of uriDetailComplete.
 */
uriDetailComplete.memo = memo(uriDetailComplete);

/**
 * Return content. Resource callback for the documentation template.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { detail = 'summary', id } = variables || {};
  const normalizedDetail = (findClosest.memo(detail, ['full', 'summary']) || detail) as 'full' | 'summary';

  assertInputStringLength(id, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'id'
  });

  const records = await filterPatternFlyContext.memo({
    id: id as string
  });
  const record = records.get(id as string);

  assertInput(
    record !== undefined,
    () => {
      let suggestionMessage = '';

      if (id) {
        suggestionMessage = ' Try using a different ID.';
      }

      return `No documentation found for "${id}".${suggestionMessage}`;
    }
  );

  if (record.isCollection) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `The ID "${id}" refers to a collection hub. Please use patternfly://collections/${id} instead.`
    );
  }

  const docs = [];

  try {
    const docPaths = record.path
      ? [{
        doc: record.path,
        uri: record.uri || passedUri.toString()
      }]
      : [];

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
    () => `"${id}" was found, but no documentation resources are available for it.`
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
          name: record?.name || (id as string),
          version: record?.version
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

  const complete: { [callback: string]: McpResourceMetadataComplete } = {
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
      metaConfig: {
        uri: 'patternfly://docs/meta{?detail}',
        title: `${CONFIG.title} Metadata`,
        description: 'Discover available parameters for PatternFly documentation ID-based resources.'
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
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG,
  type PatternFlyListResourceResult
};

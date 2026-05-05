import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { parseUri } from './server.helpers';
import { registerSessionResource } from './server.session';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { processDocsFunction } from './server.getResources';
import { hashCode } from './server.helpers';

/**
 * browsePatternFly tool function
 *
 * Unified browser for PatternFly. Handles fuzzy search, direct URIs, and external URLs.
 * Returns McpResource collection (Resource Links) when contextManagement: 'token-saver' is active.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback, config]
 */
const browsePatternFlyTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { query } = args;

    if (typeof query !== 'string' || !query.trim()) {
      throw new McpError(ErrorCode.InvalidParams, 'A query string is required.');
    }

    const trimmedQuery = query.trim();

    // 1. Check if it's an internal URI
    const internalUri = parseUri(trimmedQuery);

    if (internalUri) {
      if (internalUri.hostname === 'docs') {
        const slug = internalUri.path;
        const { byPath } = await getPatternFlyMcpResources.memo();
        const entry = byPath[slug];

        if (entry) {
          const docs = await processDocsFunction.memo([slug], options);

          if (docs && docs[0]) {
            return {
              content: [{
                type: 'resource',
                resource: {
                  uri: trimmedQuery,
                  mimeType: 'text/markdown',
                  text: docs[0].content
                }
              }]
            };
          }
        }

        throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${trimmedQuery}`);
      }
      // Handle other hostnames (schemas, session) if needed in Phase 1
    }

    // 2. Check if it's an external URL
    if (/^https?:\/\//i.test(trimmedQuery)) {
      const docs = await processDocsFunction.memo([trimmedQuery], options);

      if (docs && docs[0]) {
        const hash = hashCode(trimmedQuery);
        const sessionUri = `patternfly://session/tmp/${hash}`;

        registerSessionResource(sessionUri, docs[0].content, 'text/markdown');

        return {
          content: [{
            type: 'resource',
            resource: {
              uri: sessionUri,
              mimeType: 'text/markdown',
              text: docs[0].content
            }
          }]
        };
      }

      throw new McpError(ErrorCode.InvalidParams, `Failed to fetch URL: ${trimmedQuery}`);
    }

    // 3. Fallback to fuzzy search
    const { searchResults } = await searchPatternFly.memo(
      trimmedQuery,
      {},
      { allowWildCardAll: true, maxResults: options.minMax.toolSearches.max * 5 } // Expanded limit for token-saver
    );

    if (searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No PatternFly resources found matching "${trimmedQuery}"`
        }]
      };
    }

    return {
      content: searchResults.map(result => {
        const uri = result.uri || `patternfly://docs/${result.name}`;

        return {
          type: 'resource',
          resource: {
            uri,
            mimeType: 'text/markdown',
            text: result.entries[0]?.description || result.name // Summary/pointer
          }
        };
      })
    };
  };

  return [
    'browsePatternFly',
    {
      description: 'Unified browser for PatternFly. Handles search terms, patternfly:// URIs, and https:// URLs. Returns resource links.',
      inputSchema: {
        query: z.string().describe('Search term, patternfly:// URI, or https:// URL')
      }
    },
    callback,
    {
      shouldRegister: opts => opts.contextManagement === 'token-saver'
    }
  ];
};

browsePatternFlyTool.toolName = 'browsePatternFly';

export { browsePatternFlyTool };

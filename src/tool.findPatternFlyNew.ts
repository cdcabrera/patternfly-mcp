import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { parseUrl, stringJoin } from './server.helpers';
import { registerSessionResource } from './server.session';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import {processDocsFunction, type ProcessedDoc} from './server.getResources';
import { hashCode } from './server.helpers';
import {
  assertInput,
  assertInputStringLength,
  assertInputStringNumberEnumLike, assertInputUrlWhiteListed
} from './server.assertions';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

/**
 * findPatternFly tool function
 *
 * Unified browser for PatternFly. Handles fuzzy search, direct URIs, and external URLs.
 * Returns McpResource collection (Resource Links) when contextManagement: 'token-saver' is active.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback, config]
 */
const findPatternFlyTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { query, url, version } = args;
    const isVersion = typeof version === 'string' && version.length > 0;

    assertInputStringLength(url, {
      ...options.minMax.urlString,
      inputDisplayName: 'url'
    });

    assertInputStringLength(query, {
      // ...{ min: options.minMax.inputStrings.min, max: options.minMax.urlString.max },
      ...options.minMax.inputStrings,
      inputDisplayName: 'query'
    });

    if (isVersion) {
      assertInputStringLength(version, {
        max: options.minMax.inputStrings.max,
        min: 2,
        inputDisplayName: 'version'
      });

      assertInputStringNumberEnumLike(version, options.patternflyOptions.availableSearchVersions, {
        inputDisplayName: 'version'
      });
    }

    const { latestVersion } = await getPatternFlyMcpResources.memo();
    const normalizedVersion = await normalizeEnumeratedPatternFlyVersion(version);
    const updatedVersion = normalizedVersion || latestVersion;

    const updatedQuery = query?.trim();
    const updatedUri = parseUrl(updatedQuery, { prefix: 'patternfly', isStrict: false });
    const updatedUrl = parseUrl(updatedQuery, { isStrict: true });

    if (updatedUrl) {
      if (options.mode !== 'test') {
        assertInputUrlWhiteListed(
          updatedQuery,
          options.patternflyOptions.urlWhitelist,
          { inputDisplayName: 'url' }
        );
      }

      try {
        const [processedDoc] = await processDocsFunction.memo([updatedQuery]);

        if (processedDoc?.content) {
          const hash = hashCode(updatedQuery);
          const sessionUri = `patternfly://session/tmp/${hash}`;

          registerSessionResource(sessionUri, processedDoc.content, 'text/markdown');

          return {
            content: [{
              type: 'resource',
              resource: {
                uri: sessionUri,
                mimeType: 'text/markdown',
                text: processedDoc.content
              }
            }]
          };
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch URL: ${error}`
        );
      }

      throw new McpError(
        ErrorCode.InvalidParams,
        `Failed to fetch URL: ${updatedQuery}`
      );
    }

    // 1. Check if it's an internal URI THIS PROBABLY SHOULD BE GOING THROUGH THE SEARCH TOO
    /*
    const internalUri = parseUrl(updatedQuery, { prefix: 'patternfly', isStrict: false });

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
                  uri: updatedQuery,
                  mimeType: 'text/markdown',
                  text: docs[0].content
                }
              }]
            };
          }
        }

        // NEEDS TO BE GENERIC ASSERT
        throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${updatedQuery}`);
      }
      // Handle other hostnames (schemas, session) if needed in Phase 1
    }

     */

    // 2. Check if it's an external URL THIS NEEDS TO BE CONFIRMED BY THE WHITELISTING
    /*
    if (/^https?:\/\//i.test(updatedQuery)) {
      const docs = await processDocsFunction.memo([updatedQuery], options);

      if (docs && docs[0]) {
        const hash = hashCode(updatedQuery);
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

      // THIS NEEDS TO BE ANOTHER GENERIC ASSERT
      throw new McpError(ErrorCode.InvalidParams, `Failed to fetch URL: ${updatedQuery}`);
    }

     */

    // 3. Fallback to fuzzy search
    const { isSearchWildCardAll, exactMatches, searchResults, totalPotentialMatches } = await searchPatternFly.memo(
      updatedQuery,
      { version: updatedVersion, uri: updatedUri?.path },
      { allowWildCardAll: true, maxResults: options.minMax.resourceSearches.max }
    );

    assertInput(
      !isSearchWildCardAll || (isSearchWildCardAll && searchResults.length > 0),
      stringJoin.newline(
        `Internal Search Error: The server failed to retrieve PatternFly resources for query "${updatedQuery}"`,
        'Ensure documentation resources are loaded or restart the server.'
      ),
      ErrorCode.InternalError
    );

    if (!isSearchWildCardAll && searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: stringJoin.newline(
            `No PatternFly resources found matching "${updatedQuery}"`,
            options.separator,
            '**Important**:',
            '  - Use a search all ("*") to find all available resources.'
          )
        }]
      };
    }

    // Focus the result set if exactMatches found, or fall back to everything
    const parseResults = !isSearchWildCardAll && exactMatches.length > 0 ? exactMatches : searchResults;

    const queryTitlePatternFly = updatedVersion
      ? `Search results for PatternFly version "${updatedVersion}" and`
      : `Search results for`;

    let queryTitle = stringJoin.basic(
      `# ${queryTitlePatternFly} "${updatedQuery}".`,
      `Showing ${parseResults.length} related ${parseResults.length === 1 ? 'match' : 'matches'}.`
    );

    if (isSearchWildCardAll && totalPotentialMatches > parseResults.length) {
      queryTitle = stringJoin.basic(
        `# ${queryTitlePatternFly} "all" resources.`,
        `Only showing the first ${parseResults.length} results. There are ${totalPotentialMatches} potential match variations.`,
        `Try searching with a more specific query.`
      );
    } else if (exactMatches.length > 0) {
      queryTitle = stringJoin.basic(
        `# ${queryTitlePatternFly} "${updatedQuery}".`,
        `Showing ${parseResults.length} exact ${parseResults.length === 1 ? 'match' : 'matches'}.`
      );
    }

    const queryDescription = stringJoin.newline(
      '**Important**:',
      '  - Use the returned resources to access and read content.',
      '  - Use a search all ("*") to find all available resources.'
    );

    // List of resources
    return {
      content: [
        {
          type: 'text',
          text: stringJoin.newline(
            queryTitle,
            queryDescription
          )
        },
        ...parseResults.map(result => {
          // NO WTF WE CAN"T JUST DUMP A FALLBACK URI IT MAY NOT EXIST
          const uri = result.uri || `patternfly://docs/${result.name}`;
          const uriSchemas = result.uriSchemas;

          return {
            type: 'resource',
            resource: {
              uri,
              mimeType: 'text/markdown',
              text: result.entries[0]?.description || result.name // Summary/pointer
            }
          };
        })
      ]
    };
  };

  return [
    'findPatternFly',
    {
      description: `Unified search and use for PatternFly. Handles search terms, patternfly:// URIs, and PatternFly https:// URLs. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "query" type for keyword, URL, or URI to find and get PatternFly resources for documentation, component names, and guidelines.

      **Returns**:
        - Resource links and descriptions that can be used to get markdown documentation, guidelines, and component JSON schemas.
        - Resource content from URI or URL, if available.
      `,
      inputSchema: {
        query: z.discriminatedUnion('queryType', [
          z.object({
            queryType: z.literal('keyword')
              .describe('Select this mode to search by keyword, partial resource, or component name to get PatternFly resources (e.g., "button", "writing", "*")'),
            url: z.string().min(options.minMax.inputStrings.min).max(options.minMax.inputStrings.max)
              .describe('')
          }),
          z.object({
            queryType: z.literal('url')
              .describe('Select this mode to find and get PatternFly URL or patternfly:// URI resources.'),
            url: z.string().url().min(options.minMax.urlString.min).max(options.minMax.urlString.max)
              .describe('The URL or patternfly:// URI to return as resource content.')
          })
        ]),
        version: z.enum(options.patternflyOptions.availableSearchVersions)
          .optional()
          .describe(`Filter results by a specific PatternFly version (e.g. ${options.patternflyOptions.availableSearchVersions.map(value => `"${value}"`).join(', ')})`)
      }
    },
    callback,
    {
      shouldRegister: opts => opts.contextManagement === 'token-saver'
    }
  ];
};

/**
 * A tool name, typically the first entry in the tuple. Used in logging and deduplication.
 */
findPatternFlyTool.toolName = 'findPatternFly';

export { findPatternFlyTool };

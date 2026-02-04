import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { stringJoin } from './server.helpers';
import { getOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
// import { getPatternFlyMcpDocs } from './patternFly.getResources';

/**
 * searchPatternFlyDocs tool function
 *
 * Searches for PatternFly component documentation URLs using fuzzy search.
 * Returns URLs only (does not fetch content). Use usePatternFlyDocs to fetch the actual content.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyDocsTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { searchQuery } = args;

    if (typeof searchQuery !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: searchQuery must be a string: ${searchQuery}`
      );
    }

    if (searchQuery.length > options.maxSearchLength) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Search query exceeds ${options.maxSearchLength} character max length.`
      );
    }

    const { isSearchWildCardAll, searchResults } = await searchPatternFly.memo(searchQuery, { allowWildCardAll: true });
    // const { closestVersion } = await getPatternFlyMcpDocs.memo();

    if (!isSearchWildCardAll && searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: stringJoin.newline(
            `No PatternFly resources found matching "${searchQuery}"`,
            '',
            '---',
            // '',
            // '**Environment snapshot**:',
            // `  - Detected PatternFly Version: ${closestVersion}`,
            // '',
            '---',
            '',
            '**Important**:',
            '  - Use a search all ("*") to find all available resources.'
          )
        }]
      };
    }

    const results = searchResults.map(result => {
      const urlList = result.entriesNoGuidance.length
        ? stringJoin.newline(
          ...result.entriesNoGuidance.map((entry, index) => `  ${index + 1}. ${entry.path}`)
          // const isDetectedVersion = entry.version === closestVersion;
          // return `  ${index + 1}. ${entry.path}${isDetectedVersion ? ' **[Detected version]**' : ''}`;
        )
        : '  - No documentation URLs found';

      const guidanceUrlList = result.entriesGuidance.length
        ? stringJoin.newline(
          ...result.entriesGuidance.map((entry, index) => `  ${index + 1}. ${entry.path}`)
          // const isDetectedVersion = entry.version === closestVersion;
          // return `  ${index + 1}. ${entry.path}${isDetectedVersion ? ' **[Detected version]**' : ''}`;
        )
        : '  - No guidance URLs found';

      return stringJoin.newline(
        '',
        `## ${result.item}`,
        `**Match Type**: ${result.matchType}`,
        `### "usePatternFlyDocs" tool resource URLs`,
        `#### Documentation URLs`,
        urlList,
        `#### AI guidance URLs`,
        guidanceUrlList,
        `### Resources metadata`,
        ` - **Component name**: ${result.item}`,
        ` - **JSON Schemas**: ${result.isSchemasAvailable ? 'Available' : 'Not available'}`
      );
    });

    return {
      content: [{
        type: 'text',
        text: stringJoin.newline(
          `# Search results for "${isSearchWildCardAll ? 'all resources' : searchQuery}", ${searchResults.length} matches found:`,
          ...results,
          '',
          '---',
          // '',
          // '**Environment snapshot**:',
          // `  - Detected PatternFly Version: ${closestVersion}`,
          '',
          '---',
          '',
          '**Important**:',
          '  - Use the "usePatternFlyDocs" tool with the above URLs to fetch resource content.',
          '  - Use a search all ("*") to find all available resources.'
        )
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: `Search PatternFly resources and get component names with documentation and guidance URLs. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "searchQuery" to find PatternFly documentation and guideline URLs, and component names.
        2. Use the returned resource names OR URLs OR version with the "usePatternFlyDocs" tool to get markdown documentation, guidelines, and component JSON schemas.

      **Returns**:
        - Component and resource names that can be used with "usePatternFlyDocs"
        - Documentation and guideline URLs that can be used with "usePatternFlyDocs"
      `,
      inputSchema: {
        searchQuery: z.string().max(options.maxSearchLength).describe('Full or partial resource or component name to search for (e.g., "button", "react", "*")')
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool };

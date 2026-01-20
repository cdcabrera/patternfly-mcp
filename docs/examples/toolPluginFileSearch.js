/**
 * Example of authoring a custom tool that searches for files using find and grep.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginFileSearch.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginFileSearch.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

export default createMcpTool({
  name: 'searchFiles',
  description: 'Search for files by name pattern or search for content within files. Useful for finding files matching patterns or locating specific code patterns across a codebase.',
  inputSchema: {
    type: 'object',
    properties: {
      searchType: {
        type: 'string',
        enum: ['name', 'content'],
        description: 'Type of search: "name" to search for files by name pattern, "content" to search for text within files.'
      },
      pattern: {
        type: 'string',
        description: 'For name search: File name pattern (e.g., "*.js", "Button*.tsx"). For content search: Text pattern to search for (supports regex).'
      },
      filePatterns: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Optional: For content search only. File patterns to search in (e.g., ["*.js", "*.ts"]). Defaults to ["*"] (all files).'
      },
      directory: {
        type: 'string',
        description: 'Optional: Directory to search in. Defaults to current directory (".").'
      },
      recursive: {
        type: 'boolean',
        description: 'Optional: Search recursively in subdirectories. Defaults to true.',
        default: true
      },
      caseInsensitive: {
        type: 'boolean',
        description: 'Optional: For content search only. Case-insensitive search. Defaults to false.',
        default: false
      },
      showLineNumbers: {
        type: 'boolean',
        description: 'Optional: For content search only. Show line numbers in results. Defaults to true.',
        default: true
      }
    },
    required: ['searchType', 'pattern']
  },
  async handler({ searchType, pattern, filePatterns, directory = '.', recursive = true, caseInsensitive = false, showLineNumbers = true }) {
    try {
      if (searchType === 'name') {
        // Search for files by name using find
        const findCommand = recursive
          ? `find "${directory}" -type f -name "${pattern}" 2>/dev/null | head -100`
          : `find "${directory}" -maxdepth 1 -type f -name "${pattern}" 2>/dev/null | head -100`;

        const { stdout } = await execAsync(findCommand, {
          cwd: process.cwd(),
          encoding: 'utf8'
        });

        const files = stdout.trim().split('\n').filter(Boolean);

        return {
          content: [
            {
              type: 'text',
              text: files.length > 0 ? files.join('\n') : 'No files found.'
            }
          ]
        };
      } else {
        // Search for content using grep
        const patterns = Array.isArray(filePatterns) ? filePatterns : [filePatterns || '*'];
        const grepOptions = [];
        if (recursive) grepOptions.push('-r');
        if (caseInsensitive) grepOptions.push('-i');
        if (showLineNumbers) grepOptions.push('-n');
        grepOptions.push('--include=' + patterns.map(p => `"${p}"`).join(' --include='));

        const grepCommand = `grep ${grepOptions.filter(Boolean).join(' ')} "${pattern}" "${directory}" 2>/dev/null | head -200`.trim();

        const { stdout } = await execAsync(grepCommand, {
          cwd: process.cwd(),
          encoding: 'utf8'
        });

        const matches = stdout.trim().split('\n').filter(Boolean);

        return {
          content: [
            {
              type: 'text',
              text: matches.length > 0 ? matches.join('\n') : 'No matches found.'
            }
          ]
        };
      }
    } catch (error) {
      // find/grep return non-zero if no results found, which is expected
      const output = error.stdout || error.stderr || error.message;

      return {
        content: [
          {
            type: 'text',
            text: output || 'No results found.'
          }
        ]
      };
    }
  }
});

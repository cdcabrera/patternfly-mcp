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
import { spawn } from 'node:child_process';
import { createMcpTool } from '@patternfly/patternfly-mcp';

/**
 * Execute a command using spawn with proper argument handling.
 */
const spawnAsync = (command, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const result = { stdout, stderr, code };
      // find/grep return non-zero if no results found, which is expected
      if (code === 0 || code === 1) {
        resolve(result);
      } else {
        const error = new Error(stderr || stdout || `Process exited with code ${code}`);
        Object.assign(error, result);
        reject(error);
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
};

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
        const findArgs = [directory, '-type', 'f', '-name', pattern];
        if (!recursive) {
          findArgs.splice(1, 0, '-maxdepth', '1');
        }

        const { stdout } = await spawnAsync('find', findArgs, {
          cwd: process.cwd()
        });

        const files = stdout.trim().split('\n').filter(Boolean).slice(0, 100);

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
        const grepArgs = [];
        if (recursive) grepArgs.push('-r');
        if (caseInsensitive) grepArgs.push('-i');
        if (showLineNumbers) grepArgs.push('-n');

        // Add --include options for each file pattern
        for (const pattern of patterns) {
          grepArgs.push('--include', pattern);
        }

        grepArgs.push(pattern, directory);

        const { stdout } = await spawnAsync('grep', grepArgs, {
          cwd: process.cwd()
        });

        const matches = stdout.trim().split('\n').filter(Boolean).slice(0, 200);

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

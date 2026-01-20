/**
 * Example of authoring a custom tool that searches for files using grep.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginFileSearch.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginFileSearch.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 * - This tool uses grep to search for files, so it requires grep to be installed and accessible in the PATH.
 *   On Windows, you may need to install grep (e.g., via Git for Windows or WSL).
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

/**
 * Check if grep is available in the system PATH.
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @returns {Promise<{available: boolean, error?: string}>} Availability status
 */
const checkGrepAvailability = async (cwd = process.cwd()) => {
  try {
    await execAsync('grep --version', {
      cwd,
      timeout: 5_000,
      encoding: 'utf8'
    });

    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: 'grep is not available. Please ensure grep is installed and accessible in your PATH. On Windows, you may need Git for Windows or WSL.'
    };
  }
};

/**
 * Search for files by name pattern using grep.
 *
 * @param {string} pattern - File name pattern to search for (e.g., "*.js", "Button*.tsx")
 * @param {string} [directory] - Directory to search in (default: current directory)
 * @param {boolean} [recursive] - Search recursively in subdirectories (default: true)
 * @param {number} [timeout] - Execution timeout in milliseconds (default: 30000 = 30 seconds)
 * @returns {Promise<object>} Object with search results
 */
const searchFilesByName = async (pattern, directory = '.', recursive = true, timeout = 30_000) => {
  // Check grep availability
  const availability = await checkGrepAvailability();

  if (!availability.available) {
    throw new Error(availability.error || 'grep is not available');
  }

  // Build the find command (using find + grep pattern, or just find with -name)
  // For simplicity, we'll use find for file name matching
  const findCommand = recursive
    ? `find "${directory}" -type f -name "${pattern}" 2>/dev/null | head -100`
    : `find "${directory}" -maxdepth 1 -type f -name "${pattern}" 2>/dev/null | head -100`;

  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(findCommand, {
      cwd: process.cwd(),
      timeout,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const duration = Date.now() - startTime;
    const files = stdout.trim().split('\n').filter(Boolean);

    return {
      success: true,
      command: findCommand,
      duration,
      files,
      fileCount: files.length,
      stderr: stderr.trim() || null
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const execError = error;

    // find returns non-zero if no files found, which is expected
    if (execError.code === 1 && !execError.stderr) {
      return {
        success: true,
        command: findCommand,
        duration,
        files: [],
        fileCount: 0,
        stderr: null
      };
    }

    const errorMessage = execError.message || String(execError);
    const errorCode = execError.code || 'UNKNOWN';
    const isTimeout = errorCode === 'TIMEOUT' || errorMessage.includes('timed out');

    return {
      success: false,
      command: findCommand,
      duration,
      error: {
        message: errorMessage,
        code: errorCode,
        isTimeout
      },
      stderr: execError.stderr?.trim() || null
    };
  }
};

/**
 * Search for content within files using grep.
 *
 * @param {string} searchPattern - Text pattern to search for (supports regex)
 * @param {string|string[]} [filePatterns] - File patterns to search in (e.g., "*.js", ["*.ts", "*.tsx"])
 * @param {string} [directory] - Directory to search in (default: current directory)
 * @param {boolean} [recursive] - Search recursively in subdirectories (default: true)
 * @param {boolean} [caseInsensitive] - Case-insensitive search (default: false)
 * @param {boolean} [showLineNumbers] - Show line numbers in results (default: true)
 * @param {number} [timeout] - Execution timeout in milliseconds (default: 60000 = 1 minute)
 * @returns {Promise<object>} Object with search results
 */
const searchFilesByContent = async (
  searchPattern,
  filePatterns = ['*'],
  directory = '.',
  recursive = true,
  caseInsensitive = false,
  showLineNumbers = true,
  timeout = 60_000
) => {
  // Check grep availability
  const availability = await checkGrepAvailability();

  if (!availability.available) {
    throw new Error(availability.error || 'grep is not available');
  }

  // Normalize file patterns to array
  const patterns = Array.isArray(filePatterns) ? filePatterns : [filePatterns];

  // Build grep command
  const grepOptions = [];
  grepOptions.push(recursive ? '-r' : '');
  grepOptions.push(caseInsensitive ? '-i' : '');
  grepOptions.push(showLineNumbers ? '-n' : '');
  grepOptions.push('--include=' + patterns.map(p => `"${p}"`).join(' --include='));

  const grepCommand = `grep ${grepOptions.filter(Boolean).join(' ')} "${searchPattern}" "${directory}" 2>/dev/null | head -200`.trim();

  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(grepCommand, {
      cwd: process.cwd(),
      timeout,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const duration = Date.now() - startTime;
    const matches = stdout.trim().split('\n').filter(Boolean);

    // Parse matches into structured format
    const parsedMatches = matches.map(line => {
      const parts = line.split(':');
      const file = parts[0];
      const lineNumber = showLineNumbers && parts.length > 1 ? parts[1] : null;
      const content = showLineNumbers && parts.length > 2 ? parts.slice(2).join(':') : (parts.length > 1 ? parts.slice(1).join(':') : line);

      return {
        file,
        lineNumber: lineNumber ? Number.parseInt(lineNumber, 10) : null,
        content: content.trim()
      };
    });

    return {
      success: true,
      command: grepCommand,
      duration,
      matches: parsedMatches,
      matchCount: parsedMatches.length,
      stderr: stderr.trim() || null
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const execError = error;

    // grep returns non-zero if no matches found, which is expected
    if (execError.code === 1 && !execError.stderr) {
      return {
        success: true,
        command: grepCommand,
        duration,
        matches: [],
        matchCount: 0,
        stderr: null
      };
    }

    const errorMessage = execError.message || String(execError);
    const errorCode = execError.code || 'UNKNOWN';
    const isTimeout = errorCode === 'TIMEOUT' || errorMessage.includes('timed out');

    return {
      success: false,
      command: grepCommand,
      duration,
      error: {
        message: errorMessage,
        code: errorCode,
        isTimeout
      },
      stderr: execError.stderr?.trim() || null
    };
  }
};

export default createMcpTool({
  name: 'searchFiles',
  description: 'Search for files by name pattern or search for content within files using grep. Useful for finding files matching patterns or locating specific code patterns across a codebase.',
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
      },
      timeout: {
        type: 'number',
        description: 'Optional: Execution timeout in milliseconds. Defaults to 30000 (30 seconds) for name search, 60000 (1 minute) for content search.',
        minimum: 1000,
        maximum: 300_000 // 5 minutes max
      }
    },
    required: ['searchType', 'pattern']
  },
  async handler({ searchType, pattern, filePatterns, directory, recursive, caseInsensitive, showLineNumbers, timeout }) {
    try {
      let result;

      if (searchType === 'name') {
        const nameTimeout = timeout || 30_000;

        result = await searchFilesByName(pattern, directory, recursive, nameTimeout);

        // Format the response for name search
        const lines = [];

        if (result.success) {
          if (result.files && result.files.length > 0) {
            result.files.forEach(file => {
              lines.push(file);
            });
          }

          if (result.stderr) {
            lines.push(result.stderr);
          }
        } else {
          lines.push(`Error: ${result.error.message}`);

          if (result.error.isTimeout) {
            lines.push('Timed out. Consider increasing the timeout value.');
          }

          if (result.stderr) {
            lines.push(result.stderr);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n')
            }
          ]
        };
      } else {
        // Content search
        const contentTimeout = timeout || 60_000;

        result = await searchFilesByContent(
          pattern,
          filePatterns,
          directory,
          recursive,
          caseInsensitive,
          showLineNumbers,
          contentTimeout
        );

        // Format the response for content search
        const lines = [];

        if (result.success) {
          if (result.matches && result.matches.length > 0) {
            result.matches.forEach(match => {
              const location = showLineNumbers && match.lineNumber
                ? `${match.file}:${match.lineNumber}`
                : match.file;

              lines.push(`${location}: ${match.content}`);
            });
          }

          if (result.stderr) {
            lines.push(result.stderr);
          }
        } else {
          lines.push(`Error: ${result.error.message}`);

          if (result.error.isTimeout) {
            lines.push('Timed out. Consider increasing the timeout value.');
          }

          if (result.stderr) {
            lines.push(result.stderr);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n')
            }
          ]
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: `Failed to search files:\n\n${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
});

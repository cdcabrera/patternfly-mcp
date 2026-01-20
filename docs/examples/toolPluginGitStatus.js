/**
 * Example of authoring a custom tool that executes Git status commands.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginGitStatus.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginGitStatus.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 * - This tool executes Git commands, so it requires Git to be installed and accessible in the PATH.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

/**
 * Check if Git is available in the system PATH.
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @returns {Promise<{available: boolean, error?: string}>} Availability status
 */
const checkGitAvailability = async (cwd = process.cwd()) => {
  try {
    await execAsync('git --version', {
      cwd,
      timeout: 5_000,
      encoding: 'utf8'
    });

    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: 'Git is not available. Please ensure Git is installed and accessible in your PATH.'
    };
  }
};

/**
 * Check if the current directory is a Git repository.
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @returns {Promise<{isRepo: boolean, error?: string}>} Repository status
 */
const checkGitRepository = async (cwd = process.cwd()) => {
  try {
    await execAsync('git rev-parse --git-dir', {
      cwd,
      timeout: 5_000,
      encoding: 'utf8'
    });

    return { isRepo: true };
  } catch {
    return {
      isRepo: false,
      error: 'Current directory is not a Git repository.'
    };
  }
};

/**
 * Execute git status command with proper error handling and output formatting.
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @param {boolean} [short] - Use short format output (default: false)
 * @param {number} [timeout] - Execution timeout in milliseconds (default: 10000 = 10 seconds)
 * @returns {Promise<object>} Object with execution results
 */
const executeGitStatus = async (cwd = process.cwd(), short = false, timeout = 10_000) => {
  // Check Git availability
  const availability = await checkGitAvailability(cwd);

  if (!availability.available) {
    throw new Error(availability.error || 'Git is not available');
  }

  // Check if it's a Git repository
  const repoCheck = await checkGitRepository(cwd);

  if (!repoCheck.isRepo) {
    throw new Error(repoCheck.error || 'Not a Git repository');
  }

  // Build the command string
  const command = short ? 'git status --short' : 'git status';
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const duration = Date.now() - startTime;

    // Parse the status output
    const statusOutput = stdout.trim();
    const lines = statusOutput.split('\n');
    const isClean = statusOutput.includes('nothing to commit') || (short && lines.length === 0);

    return {
      success: true,
      command,
      duration,
      isClean,
      stdout: statusOutput || null,
      stderr: stderr.trim() || null,
      lineCount: lines.length
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const execError = error;

    // Extract error details
    const errorMessage = execError.message || String(execError);
    const errorCode = execError.code || 'UNKNOWN';
    const isTimeout = errorCode === 'TIMEOUT' || errorMessage.includes('timed out');

    return {
      success: false,
      command,
      duration,
      error: {
        message: errorMessage,
        code: errorCode,
        isTimeout
      },
      stdout: execError.stdout?.trim() || null,
      stderr: execError.stderr?.trim() || null
    };
  }
};

export default createMcpTool({
  name: 'getGitStatus',
  description: 'Get Git repository status with formatted output. Returns information about working directory, staged files, and recent commits. Useful for AI agents to understand project state before making changes.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Optional: Current working directory. Defaults to process.cwd().'
      },
      short: {
        type: 'boolean',
        description: 'Optional: Use short format output (git status --short). Defaults to false.',
        default: false
      },
      timeout: {
        type: 'number',
        description: 'Optional: Execution timeout in milliseconds. Defaults to 10000 (10 seconds).',
        minimum: 1000,
        maximum: 60_000 // 1 minute max
      }
    }
  },
  async handler({ cwd, short, timeout }) {
    try {
      const result = await executeGitStatus(cwd, short, timeout);

      // Format the response
      const lines = [
        `Git Status Command: ${result.command}`,
        `Duration: ${result.duration}ms`,
        `Status: ${result.success ? '✅ Success' : '❌ Failed'}`,
        ''
      ];

      if (result.success) {
        lines.push(`Repository Status: ${result.isClean ? '✅ Clean (no changes)' : '⚠️  Has changes'}`);

        if (result.lineCount !== undefined) {
          lines.push(`Output Lines: ${result.lineCount}`);
        }

        lines.push('');

        if (result.stdout) {
          lines.push('--- Git Status Output ---');
          lines.push(result.stdout);
          lines.push('');
        }

        if (result.stderr) {
          lines.push('--- STDERR ---');
          lines.push(result.stderr);
          lines.push('');
        }

        if (!result.stdout && !result.stderr) {
          lines.push('(No output produced)');
        }
      } else {
        lines.push(`Error: ${result.error.message}`);
        lines.push(`Error Code: ${result.error.code}`);

        if (result.error.isTimeout) {
          lines.push('⚠️  Command execution timed out. Consider increasing the timeout value.');
        }

        lines.push('');

        if (result.stdout) {
          lines.push('--- STDOUT (before error) ---');
          lines.push(result.stdout);
          lines.push('');
        }

        if (result.stderr) {
          lines.push('--- STDERR ---');
          lines.push(result.stderr);
          lines.push('');
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: `Failed to get Git status:\n\n${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
});

/**
 * Example of authoring a custom tool that executes PatternFly CLI commands.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginPatternFlyCli.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginPatternFlyCli.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 * - This tool executes PatternFly CLI commands, so it requires access to @patternfly/patternfly-cli (via npx or local installation).
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

/**
 * Check if PatternFly CLI is available (either via npx or locally installed).
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @returns {Promise<{available: boolean, method: string|null, error?: string}>} Availability status
 */
const checkCliAvailability = async (cwd = process.cwd()) => {
  // Try npx first (most common case)
  try {
    await execAsync('npx @patternfly/patternfly-cli --help', {
      cwd,
      timeout: 10_000,
      encoding: 'utf8'
    });

    return { available: true, method: 'npx' };
  } catch {
    // Try local installation
    try {
      await execAsync('patternfly-cli --help', {
        cwd,
        timeout: 10_000,
        encoding: 'utf8'
      });

      return { available: true, method: 'local' };
    } catch (localError) {
      return {
        available: false,
        method: null,
        error: 'PatternFly CLI not found. Install it with: npm install -g @patternfly/patternfly-cli or use npx.'
      };
    }
  }
};

/**
 * Execute a PatternFly CLI command with proper error handling and output formatting.
 *
 * @param {string} command - CLI command to execute (e.g., "--help", "generate component")
 * @param {string[]} [args] - Additional arguments to pass to the CLI
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @param {number} [timeout] - Execution timeout in milliseconds (default: 300000 = 5 minutes)
 * @returns {Promise<object>} Object with execution results
 */
const executePatternFlyCli = async (command, args = [], cwd = process.cwd(), timeout = 300_000) => {
  // Check CLI availability
  const availability = await checkCliAvailability(cwd);

  if (!availability.available) {
    throw new Error(availability.error || 'PatternFly CLI is not available');
  }

  // Build the command string
  const cliCommand = availability.method === 'npx'
    ? `npx @patternfly/patternfly-cli ${command} ${args.join(' ')}`.trim()
    : `patternfly-cli ${command} ${args.join(' ')}`.trim();

  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(cliCommand, {
      cwd,
      timeout,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const duration = Date.now() - startTime;
    const hasOutput = stdout.trim().length > 0 || stderr.trim().length > 0;

    return {
      success: true,
      command: cliCommand,
      method: availability.method,
      duration,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
      hasOutput
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
      command: cliCommand,
      method: availability.method,
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
  name: 'runPatternFlyCli',
  description: 'Execute PatternFly CLI commands with validation and error handling. Useful for running CLI commands like --help, component generation, and other PatternFly CLI operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The PatternFly CLI command to execute (e.g., "--help", "generate component", "build").'
      },
      args: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Optional: Additional arguments to pass to the CLI command.',
        default: []
      },
      cwd: {
        type: 'string',
        description: 'Optional: Current working directory. Defaults to process.cwd().'
      },
      timeout: {
        type: 'number',
        description: 'Optional: Execution timeout in milliseconds. Defaults to 300000 (5 minutes).',
        minimum: 1000,
        maximum: 3_600_000 // 1 hour max
      }
    },
    required: ['command']
  },
  async handler({ command, args, cwd, timeout }) {
    try {
      const result = await executePatternFlyCli(command, args, cwd, timeout);

      // Format the response
      const lines = [];

      if (result.success) {
        if (result.stdout) {
          lines.push(result.stdout);
        }

        if (result.stderr) {
          lines.push(result.stderr);
        }
      } else {
        lines.push(`Error: ${result.error.message}`);

        if (result.error.isTimeout) {
          lines.push('Timed out. Consider increasing the timeout value.');
        }

        if (result.stdout) {
          lines.push(result.stdout);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute PatternFly CLI command "${command}":\n\n${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
});

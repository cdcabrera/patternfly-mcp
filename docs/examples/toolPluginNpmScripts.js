/**
 * Example of authoring a custom tool that executes NPM scripts.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginNpmScripts.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginNpmScripts.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 * - This tool executes NPM scripts, so it requires access to the project's package.json and node_modules.
 */
import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

/**
 * Read and parse package.json from the current working directory.
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @returns {object|null} Parsed package.json object, or null if not found
 */
const readPackageJson = (cwd = process.cwd()) => {
  try {
    const packageJsonPath = join(cwd, 'package.json');
    const content = readFileSync(packageJsonPath, 'utf8');

    return JSON.parse(content);
  } catch {
    return null;
  }
};

/**
 * Get available NPM scripts from package.json.
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @returns {object} Object with script names as keys and commands as values, or empty object
 */
const getAvailableScripts = (cwd = process.cwd()) => {
  const packageJson = readPackageJson(cwd);

  return packageJson?.scripts || {};
};

/**
 * Execute an NPM script with proper error handling and output formatting.
 *
 * @param {string} scriptName - Name of the NPM script to execute
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @param {number} [timeout] - Execution timeout in milliseconds (default: 300000 = 5 minutes)
 * @returns {Promise<object>} Object with execution results
 */
const executeNpmScript = async (scriptName, cwd = process.cwd(), timeout = 300_000) => {
  // Validate script exists
  const availableScripts = getAvailableScripts(cwd);

  if (!availableScripts[scriptName]) {
    const availableNames = Object.keys(availableScripts).sort();

    throw new Error(
      `NPM script "${scriptName}" not found in package.json.\n` +
      `Available scripts: ${availableNames.length > 0 ? availableNames.join(', ') : 'none'}`
    );
  }

  // Execute the script
  const command = `npm run ${scriptName}`;
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const duration = Date.now() - startTime;
    const hasOutput = stdout.trim().length > 0 || stderr.trim().length > 0;

    return {
      success: true,
      scriptName,
      command,
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
      scriptName,
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
  name: 'runNpmScript',
  description: 'Execute an NPM script from package.json with validation and error handling. Useful for running build, test, lint, and other development scripts.',
  inputSchema: {
    type: 'object',
    properties: {
      scriptName: {
        type: 'string',
        description: 'The name of the NPM script to execute (e.g., "build", "test", "lint").'
      },
      cwd: {
        type: 'string',
        description: 'Optional: Current working directory where package.json is located. Defaults to process.cwd().'
      },
      timeout: {
        type: 'number',
        description: 'Optional: Execution timeout in milliseconds. Defaults to 300000 (5 minutes).',
        minimum: 1000,
        maximum: 3_600_000 // 1 hour max
      }
    },
    required: ['scriptName']
  },
  async handler({ scriptName, cwd, timeout }) {
    try {
      const result = await executeNpmScript(scriptName, cwd, timeout);

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
            text: `Failed to execute NPM script "${scriptName}":\n\n${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
});

/**
 * Example of authoring a custom tool that executes ESLint commands.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginESLint.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginESLint.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 * - This tool executes ESLint commands, so it requires ESLint to be available (via npx, local installation, or in node_modules).
 */
import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

/**
 * Check if ESLint is available (via npx, local installation, or in node_modules).
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @returns {Promise<{available: boolean, method: string|null, error?: string}>} Availability status
 */
const checkESLintAvailability = async (cwd = process.cwd()) => {
  // Try npx first (most common case)
  try {
    await execAsync('npx eslint --version', {
      cwd,
      timeout: 10_000,
      encoding: 'utf8'
    });

    return { available: true, method: 'npx' };
  } catch {
    // Try local installation
    try {
      await execAsync('eslint --version', {
        cwd,
        timeout: 10_000,
        encoding: 'utf8'
      });

      return { available: true, method: 'local' };
    } catch {
      // Try node_modules/.bin/eslint
      try {
        const nodeModulesPath = join(cwd, 'node_modules', '.bin', 'eslint');

        await execAsync(`"${nodeModulesPath}" --version`, {
          cwd,
          timeout: 10_000,
          encoding: 'utf8',
          shell: true
        });

        return { available: true, method: 'node_modules' };
      } catch {
        return {
          available: false,
          method: null,
          error: 'ESLint not found. Install it with: npm install --save-dev eslint or use npx.'
        };
      }
    }
  }
};

/**
 * Read and parse package.json to check for ESLint configuration.
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
 * Execute ESLint command with proper error handling and output formatting.
 *
 * @param {string|string[]} files - File or directory patterns to lint
 * @param {string[]} [options] - Additional ESLint options (e.g., ["--fix", "--format", "json"])
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @param {number} [timeout] - Execution timeout in milliseconds (default: 300000 = 5 minutes)
 * @returns {Promise<object>} Object with execution results
 */
const executeESLint = async (files, options = [], cwd = process.cwd(), timeout = 300_000) => {
  // Check ESLint availability
  const availability = await checkESLintAvailability(cwd);

  if (!availability.available) {
    throw new Error(availability.error || 'ESLint is not available');
  }

  // Normalize files to array
  const filePatterns = Array.isArray(files) ? files : [files];

  // Build the command string
  let cliCommand;

  if (availability.method === 'npx') {
    cliCommand = `npx eslint ${filePatterns.join(' ')} ${options.join(' ')}`.trim();
  } else if (availability.method === 'node_modules') {
    const nodeModulesPath = join(cwd, 'node_modules', '.bin', 'eslint');

    cliCommand = `"${nodeModulesPath}" ${filePatterns.join(' ')} ${options.join(' ')}`.trim();
  } else {
    cliCommand = `eslint ${filePatterns.join(' ')} ${options.join(' ')}`.trim();
  }

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

    // Check if there are linting errors (ESLint exits with code 1 if there are errors)
    // But since we're catching errors, we need to check the output
    const hasErrors = stdout.includes('✖') || stdout.includes('error') || stderr.includes('error');

    return {
      success: true,
      command: cliCommand,
      method: availability.method,
      duration,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
      hasOutput,
      hasErrors
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const execError = error;

    // ESLint exits with code 1 when there are linting errors, which is expected behavior
    // We should treat this as success if we got output
    const exitCode = execError.code || 0;
    const isLintingError = exitCode === 1 && (execError.stdout || execError.stderr);

    if (isLintingError) {
      // This is actually a successful lint run with errors found
      const stdout = execError.stdout?.trim() || '';
      const stderr = execError.stderr?.trim() || '';

      return {
        success: true,
        command: cliCommand,
        method: availability.method,
        duration,
        stdout: stdout || null,
        stderr: stderr || null,
        hasOutput: stdout.length > 0 || stderr.length > 0,
        hasErrors: true
      };
    }

    // Extract error details for actual failures
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
  name: 'runESLint',
  description: 'Execute ESLint on files or directories with validation and error handling. Useful for linting code, checking for style issues, and fixing auto-fixable problems.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        oneOf: [
          {
            type: 'string',
            description: 'File or directory pattern to lint (e.g., "src/**/*.js", "src/index.js").'
          },
          {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Array of file or directory patterns to lint.'
          }
        ],
        description: 'File(s) or directory pattern(s) to lint.'
      },
      options: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Optional: Additional ESLint options (e.g., ["--fix", "--format", "json", "--max-warnings", "0"]).',
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
    required: ['files']
  },
  async handler({ files, options, cwd, timeout }) {
    try {
      const result = await executeESLint(files, options, cwd, timeout);

      // Format the response
      const lines = [
        `ESLint Command: ${result.command}`,
        `Execution Method: ${result.method}`,
        `Duration: ${result.duration}ms`,
        `Status: ${result.success ? '✅ Success' : '❌ Failed'}`,
        ''
      ];

      if (result.success) {
        if (result.hasErrors !== undefined) {
          lines.push(`Linting Result: ${result.hasErrors ? '⚠️  Issues found' : '✅ No issues found'}`);
          lines.push('');
        }

        if (result.stdout) {
          lines.push('--- ESLint Output ---');
          lines.push(result.stdout);
          lines.push('');
        }

        if (result.stderr) {
          lines.push('--- STDERR ---');
          lines.push(result.stderr);
          lines.push('');
        }

        if (!result.hasOutput) {
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
            text: `Failed to execute ESLint:\n\n${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
});

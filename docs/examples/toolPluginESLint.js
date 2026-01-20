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
      // ESLint exits with code 1 when there are linting errors, which is expected
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
  name: 'runESLint',
  description: 'Execute ESLint on files or directories. Useful for linting code, checking for style issues, and fixing auto-fixable problems.',
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
        description: 'Optional: Additional ESLint options (e.g., ["--fix", "--format", "json"]).',
        default: []
      },
      cwd: {
        type: 'string',
        description: 'Optional: Current working directory. Defaults to process.cwd().'
      }
    },
    required: ['files']
  },
  async handler({ files, options = [], cwd }) {
    try {
      const filePatterns = Array.isArray(files) ? files : [files];
      const args = ['eslint', ...filePatterns, ...options];
      const { stdout, stderr } = await spawnAsync('npx', args, {
        cwd: cwd || process.cwd()
      });

      return {
        content: [
          {
            type: 'text',
            text: stdout || stderr || 'No linting issues found.'
          }
        ]
      };
    } catch (error) {
      // ESLint exits with code 1 when there are linting errors, which is expected
      const output = error.stdout || error.stderr || error.message;

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    }
  }
});

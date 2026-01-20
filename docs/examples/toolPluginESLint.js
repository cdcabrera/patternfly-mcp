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
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

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
      const command = `npx eslint ${filePatterns.join(' ')} ${options.join(' ')}`.trim();
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        encoding: 'utf8'
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

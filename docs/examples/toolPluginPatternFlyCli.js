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
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

export default createMcpTool({
  name: 'runPatternFlyCli',
  description: 'Execute PatternFly CLI commands. Useful for running CLI commands like --help, component generation, and other PatternFly CLI operations.',
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
      }
    },
    required: ['command']
  },
  async handler({ command, args = [], cwd }) {
    try {
      // Try npx first, fallback to local installation
      const cliCommand = `npx @patternfly/patternfly-cli ${command} ${args.join(' ')}`.trim();
      const { stdout, stderr } = await execAsync(cliCommand, {
        cwd: cwd || process.cwd(),
        encoding: 'utf8'
      });

      return {
        content: [
          {
            type: 'text',
            text: stdout || stderr || 'Command executed successfully.'
          }
        ]
      };
    } catch (error) {
      const output = error.stdout || error.stderr || error.message;

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ],
        isError: true
      };
    }
  }
});

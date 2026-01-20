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
import { spawn } from 'node:child_process';
import { createMcpTool } from '@patternfly/patternfly-mcp';

/**
 * Execute a command using spawn with proper argument handling.
 */
const spawnAsync = (command, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const result = { stdout, stderr, code };
      code === 0 ? resolve(result) : reject(Object.assign(new Error(stderr || stdout || `Exit code ${code}`), result));
    });

    child.on('error', reject);
  });
};

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
      // Split command into parts if it contains spaces (e.g., "generate component")
      const commandParts = command.split(/\s+/);
      const npxArgs = ['@patternfly/patternfly-cli', ...commandParts, ...args];

      const { stdout, stderr } = await spawnAsync('npx', npxArgs, {
        cwd: cwd || process.cwd()
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

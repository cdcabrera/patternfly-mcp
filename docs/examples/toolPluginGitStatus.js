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
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

export default createMcpTool({
  name: 'getGitStatus',
  description: 'Get Git repository status. Returns information about working directory, staged files, and recent commits.',
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
      }
    }
  },
  async handler({ cwd, short = false }) {
    try {
      const command = short ? 'git status --short' : 'git status';
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        encoding: 'utf8'
      });

      return {
        content: [
          {
            type: 'text',
            text: stdout || stderr || 'No changes.'
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

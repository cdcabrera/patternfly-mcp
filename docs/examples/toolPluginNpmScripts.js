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
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const execAsync = promisify(exec);

export default createMcpTool({
  name: 'runNpmScript',
  description: 'Execute an NPM script from package.json. Useful for running build, test, lint, and other development scripts.',
  inputSchema: {
    type: 'object',
    properties: {
      scriptName: {
        type: 'string',
        description: 'The name of the NPM script to execute (e.g., "build", "test", "lint").'
      },
      cwd: {
        type: 'string',
        description: 'Optional: Current working directory. Defaults to process.cwd().'
      }
    },
    required: ['scriptName']
  },
  async handler({ scriptName, cwd }) {
    try {
      const { stdout, stderr } = await execAsync(`npm run ${scriptName}`, {
        cwd: cwd || process.cwd(),
        encoding: 'utf8'
      });

      return {
        content: [
          {
            type: 'text',
            text: stdout || stderr || 'Script executed successfully.'
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

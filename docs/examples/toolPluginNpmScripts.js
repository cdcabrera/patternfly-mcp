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
      const { stdout, stderr } = await spawnAsync('npm', ['run', scriptName], {
        cwd: cwd || process.cwd()
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

/**
 * Example of authoring a custom tool that queries the NPM registry API.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginNpmRegistry.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginNpmRegistry.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 */
import { get } from 'node:https';
import { createMcpTool } from '@patternfly/patternfly-mcp';

/**
 * Fetch JSON from a URL using Node.js https module.
 */
const fetchJson = (url) => {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Request failed'}`));
        response.resume();
        return;
      }

      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (parseError) {
          reject(new Error(`Failed to parse JSON: ${parseError.message}`));
        }
      });
    });

    request.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });
  });
};

export default createMcpTool({
  name: 'queryNpmRegistry',
  description: 'Query the NPM registry for package information. Useful for checking package versions, dependencies, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: 'The name of the NPM package to query (e.g., "@patternfly/react-core", "react", "typescript").'
      },
      version: {
        type: 'string',
        description: 'Optional: Specific version to query. Defaults to "latest".',
        default: 'latest'
      }
    },
    required: ['packageName']
  },
  async handler({ packageName, version = 'latest' }) {
    try {
      const sanitizedName = encodeURIComponent(packageName);
      const url = version === 'latest'
        ? `https://registry.npmjs.org/${sanitizedName}`
        : `https://registry.npmjs.org/${sanitizedName}/${encodeURIComponent(version)}`;

      const data = await fetchJson(url);
      const latestVersion = data['dist-tags']?.latest || data.version;
      const lines = [
        `${data.name || packageName}@${latestVersion}`
      ];

      if (data.description) {
        lines.push(data.description);
      }

      if (data.versions) {
        const versions = Object.keys(data.versions).slice(-5);
        lines.push(`Recent versions: ${versions.join(', ')}`);
      }

      if (data.dependencies) {
        const deps = Object.keys(data.dependencies).slice(0, 10);
        lines.push(`Dependencies: ${deps.join(', ')}${Object.keys(data.dependencies).length > 10 ? '...' : ''}`);
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
      return {
        content: [
          {
            type: 'text',
            text: `Failed to query NPM registry: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
});

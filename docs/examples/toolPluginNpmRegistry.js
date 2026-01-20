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
 * - This tool queries the NPM registry API, so it requires network access.
 */
import { get } from 'node:https';
import { createMcpTool } from '@patternfly/patternfly-mcp';

/**
 * Make an HTTP GET request to a URL and return the response as JSON.
 *
 * @param {string} url - URL to fetch
 * @param {number} [timeout] - Request timeout in milliseconds (default: 30000 = 30 seconds)
 * @returns {Promise<object>} Parsed JSON response
 */
const fetchJson = (url, timeout = 30_000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let timeoutId;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);

    try {
      const request = get(url, (response) => {
        cleanup();

        const statusCode = response.statusCode || 0;

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode}: ${response.statusMessage || 'Request failed'}`));
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
            const duration = Date.now() - startTime;
            const parsed = JSON.parse(data);

            resolve({ data: parsed, duration, statusCode });
          } catch (parseError) {
            reject(new Error(`Failed to parse JSON response: ${parseError.message}`));
          }
        });
      });

      request.on('error', (error) => {
        cleanup();
        reject(new Error(`Request failed: ${error.message}`));
      });

      request.setTimeout(timeout, () => {
        request.destroy();
        cleanup();
        reject(new Error(`Request timed out after ${timeout}ms`));
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};

/**
 * Query NPM registry for package information.
 *
 * @param {string} packageName - Name of the package to query
 * @param {string} [version] - Specific version to query (default: latest)
 * @param {number} [timeout] - Request timeout in milliseconds (default: 30000 = 30 seconds)
 * @returns {Promise<object>} Object with package information
 */
const queryNpmRegistry = async (packageName, version = 'latest', timeout = 30_000) => {
  // Validate package name
  if (!packageName || typeof packageName !== 'string' || packageName.trim().length === 0) {
    throw new Error('Package name is required and must be a non-empty string');
  }

  // Sanitize package name (remove @scope if needed for URL encoding)
  const sanitizedName = encodeURIComponent(packageName);
  const url = version === 'latest'
    ? `https://registry.npmjs.org/${sanitizedName}`
    : `https://registry.npmjs.org/${sanitizedName}/${encodeURIComponent(version)}`;

  const startTime = Date.now();

  try {
    const { data, duration, statusCode } = await fetchJson(url, timeout);

    // Extract relevant information
    const packageInfo = {
      name: data.name || packageName,
      version: data.version || (data['dist-tags']?.latest || 'unknown'),
      description: data.description || null,
      homepage: data.homepage || null,
      repository: data.repository ? {
        type: data.repository.type || null,
        url: data.repository.url || null
      } : null,
      author: data.author || null,
      license: data.license || null,
      keywords: data.keywords || [],
      dependencies: data.dependencies ? Object.keys(data.dependencies) : [],
      devDependencies: data.devDependencies ? Object.keys(data.devDependencies) : [],
      distTags: data['dist-tags'] || {},
      versions: data.versions ? Object.keys(data.versions).sort((a, b) => {
        // Simple version comparison (basic)
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);

        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const partA = partsA[i] || 0;
          const partB = partsB[i] || 0;

          if (partA < partB) {
            return 1;
          }

          if (partA > partB) {
            return -1;
          }
        }

        return 0;
      }) : [],
      time: data.time || {},
      duration,
      statusCode
    };

    return {
      success: true,
      packageName,
      version: version === 'latest' ? packageInfo.distTags.latest || packageInfo.version : version,
      packageInfo,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timed out');
    const isNotFound = errorMessage.includes('404') || errorMessage.includes('HTTP 404');

    return {
      success: false,
      packageName,
      version,
      duration,
      error: {
        message: errorMessage,
        isTimeout,
        isNotFound
      }
    };
  }
};

/**
 * Get latest version information for a package.
 *
 * @param {string} packageName - Name of the package to query
 * @param {number} [timeout] - Request timeout in milliseconds (default: 30000 = 30 seconds)
 * @returns {Promise<object>} Object with latest version information
 */
const getLatestVersion = async (packageName, timeout = 30_000) => {
  const result = await queryNpmRegistry(packageName, 'latest', timeout);

  if (!result.success) {
    return result;
  }

  const latestVersion = result.packageInfo.distTags.latest || result.packageInfo.version;
  const allVersions = result.packageInfo.versions || [];

  return {
    ...result,
    latestVersion,
    versionCount: allVersions.length,
    recentVersions: allVersions.slice(0, 10) // Last 10 versions
  };
};

export default createMcpTool({
  name: 'queryNpmRegistry',
  description: 'Query the NPM registry for package information including versions, dependencies, metadata, and release information. Useful for checking package versions, validating compatibility, and discovering package details.',
  inputSchema: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: 'The name of the NPM package to query (e.g., "@patternfly/react-core", "react", "typescript").'
      },
      version: {
        type: 'string',
        description: 'Optional: Specific version to query (e.g., "1.2.3", "latest", "^1.0.0"). Defaults to "latest".',
        default: 'latest'
      },
      queryType: {
        type: 'string',
        enum: ['info', 'latest'],
        description: 'Optional: Type of query. "info" returns full package information, "latest" returns latest version details. Defaults to "info".',
        default: 'info'
      },
      timeout: {
        type: 'number',
        description: 'Optional: Request timeout in milliseconds. Defaults to 30000 (30 seconds).',
        minimum: 1000,
        maximum: 120_000 // 2 minutes max
      }
    },
    required: ['packageName']
  },
  async handler({ packageName, version, queryType, timeout }) {
    try {
      const queryTimeout = timeout || 30_000;
      let result;

      if (queryType === 'latest') {
        result = await getLatestVersion(packageName, queryTimeout);
      } else {
        result = await queryNpmRegistry(packageName, version || 'latest', queryTimeout);
      }

      // Format the response
      const lines = [
        `NPM Registry Query: ${packageName}`,
        `Query Type: ${queryType || 'info'}`,
        `Version: ${result.version || version || 'latest'}`,
        `Duration: ${result.duration}ms`,
        `Status: ${result.success ? '✅ Success' : '❌ Failed'}`,
        ''
      ];

      if (result.success) {
        const info = result.packageInfo || {};
        const latest = result.latestVersion || info.version;

        lines.push('--- Package Information ---');
        lines.push(`Name: ${info.name || packageName}`);
        lines.push(`Version: ${latest}`);
        lines.push(`Description: ${info.description || '(No description)'}`);
        lines.push(`License: ${info.license || '(No license specified)'}`);

        if (info.homepage) {
          lines.push(`Homepage: ${info.homepage}`);
        }

        if (info.repository) {
          lines.push(`Repository: ${info.repository.type || ''} ${info.repository.url || ''}`.trim());
        }

        if (info.author) {
          const authorInfo = typeof info.author === 'string' ? info.author : `${info.author.name || ''} ${info.author.email || ''}`.trim();

          lines.push(`Author: ${authorInfo || '(No author specified)'}`);
        }

        lines.push('');

        if (queryType === 'latest') {
          lines.push(`Latest Version: ${latest}`);
          lines.push(`Total Versions: ${result.versionCount || 0}`);
          lines.push('');

          if (result.recentVersions && result.recentVersions.length > 0) {
            lines.push('--- Recent Versions (last 10) ---');
            result.recentVersions.forEach(v => {
              lines.push(`  ${v}`);
            });
            lines.push('');
          }
        } else {
          // Full info
          if (info.distTags && Object.keys(info.distTags).length > 0) {
            lines.push('--- Distribution Tags ---');
            Object.entries(info.distTags).forEach(([tag, tagVersion]) => {
              lines.push(`  ${tag}: ${tagVersion}`);
            });
            lines.push('');
          }

          if (info.versions && info.versions.length > 0) {
            lines.push(`Total Versions: ${info.versions.length}`);
            lines.push(`Latest 5 Versions: ${info.versions.slice(0, 5).join(', ')}`);
            lines.push('');
          }

          if (info.keywords && info.keywords.length > 0) {
            lines.push(`Keywords: ${info.keywords.join(', ')}`);
            lines.push('');
          }

          if (info.dependencies && info.dependencies.length > 0) {
            lines.push(`Dependencies (${info.dependencies.length}): ${info.dependencies.slice(0, 10).join(', ')}${info.dependencies.length > 10 ? '...' : ''}`);
            lines.push('');
          }

          if (info.devDependencies && info.devDependencies.length > 0) {
            lines.push(`Dev Dependencies (${info.devDependencies.length}): ${info.devDependencies.slice(0, 10).join(', ')}${info.devDependencies.length > 10 ? '...' : ''}`);
            lines.push('');
          }
        }
      } else {
        lines.push(`Error: ${result.error.message}`);

        if (result.error.isNotFound) {
          lines.push('⚠️  Package not found. Check the package name and try again.');
        } else if (result.error.isTimeout) {
          lines.push('⚠️  Request timed out. The NPM registry may be slow or unavailable.');
        }

        lines.push('');
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
            text: `Failed to query NPM registry for "${packageName}":\n\n${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
});

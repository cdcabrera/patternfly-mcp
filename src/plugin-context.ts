import { resolve } from 'node:path';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { PluginContext } from './types';
import { memo } from './server.caching';
import { fetchUrl, readFile } from './server.getResources';
import { OPTIONS } from './options';

/**
 * Build plugin context with utilities and configuration
 *
 * Provides plugins with access to:
 * - Server configuration (read-only)
 * - Utility functions (memo, fetchUrl, readFile, resolveLocalPath)
 * - Logger functions (info, warn, error, debug)
 *
 * @param config - Server configuration
 * @param options - Application options
 * @returns Plugin context object
 */
const buildPluginContext = (
  config: Record<string, unknown> = {},
  options = OPTIONS
): PluginContext => {
  // Build config with required fields
  const pluginConfig = {
    serverName: options.name,
    serverVersion: options.version,
    separator: options.separator,
    ...config
  };

  // Freeze config to prevent plugins from modifying it
  const frozenConfig = Object.freeze(pluginConfig);

  return {
    config: frozenConfig,
    utils: {
      memo,
      fetchUrl,
      readFile,
      resolveLocalPath: (relativeOrAbsolute: string): string => {
        // If it's already absolute, return as-is
        if (relativeOrAbsolute.startsWith('/') || /^[a-z]:\\/i.test(relativeOrAbsolute)) {
          return relativeOrAbsolute;
        }

        // Resolve relative to context path (docs directory)
        if (options.docsHost) {
          return resolve(options.docsPath, relativeOrAbsolute);
        }

        // Resolve relative to current working directory
        return resolve(process.cwd(), relativeOrAbsolute);
      }
    },
    logger: {
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console)
    },
    types: {
      McpError,
      ErrorCode
    }
  };
};

export { buildPluginContext };


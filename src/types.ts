/**
 * Public type definitions for PatternFly MCP Server
 *
 * This file provides type definitions for:
 * - Plugin authors creating MCP tool plugins
 * - Consumers of the PatternFly MCP Server API
 * - Configuration files and CLI options
 *
 * @packageDocumentation
 */

import type { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolCreator } from './server';

// =============================================================================
// Re-exported Server Types
// =============================================================================

export type { McpTool, McpToolCreator } from './server';

// =============================================================================
// Re-exported Options Types
// =============================================================================

export type { CliOptions } from './options';

// =============================================================================
// Tool Callback Types
// =============================================================================

/**
 * Arguments passed to MCP tool callbacks
 *
 * Each tool defines its own argument structure based on its inputSchema.
 * This is a generic interface that tools can extend or narrow.
 */
export interface ToolCallbackArgs {
  [key: string]: unknown;
}

/**
 * Text content item for tool responses
 */
export interface TextContent {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

/**
 * Image content item for tool responses
 */
export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
  [key: string]: unknown;
}

/**
 * Standard MCP tool response format
 *
 * Tools must return an object with a content array containing text/image items.
 * Matches the MCP SDK's expected response structure.
 */
export interface ToolCallbackResponse {
  content: Array<TextContent | ImageContent>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Type-safe tool callback function signature
 *
 * @param args - Arguments object (validated by Zod schema)
 * @returns Promise resolving to standard response format
 */
export type ToolCallback = (args: ToolCallbackArgs) => Promise<ToolCallbackResponse>;

// =============================================================================
// Memoization Types
// =============================================================================

/**
 * Configuration options for memoization utilities
 */
export interface MemoOptions {

  /**
   * Maximum number of cached entries (default: 100)
   * When exceeded, oldest entries are evicted (LRU)
   */
  cacheLimit?: number;

  /**
   * Time-to-live in milliseconds (default: 60000 = 1 minute)
   * Uses sliding expiration (resets on access)
   */
  expire?: number;

  /**
   * Whether to cache error results (default: false)
   */
  cacheErrors?: boolean;

  /**
   * Debug callback for cache operations
   */
  debug?: (info: { type: string; value: unknown; cache: unknown[] }) => void;
}

// =============================================================================
// Plugin Context Types
// =============================================================================

/**
 * Restricted plugin context provided to all plugins
 *
 * Exposes only safe, stable utilities and configuration.
 * This context is frozen and cannot be modified by plugins.
 *
 * @example
 * ```typescript
 * const plugin: PluginFactory = (context) => {
 *   const { utils, config, types } = context;
 *
 *   // Use memoization
 *   const memoFetch = utils.memo(myFetchFn, { cacheLimit: 50 });
 *
 *   // Fetch URLs
 *   const content = await utils.fetchUrl('https://example.com/data.json');
 *
 *   // Read files
 *   const fileData = await utils.readFile('./path/to/file.txt');
 *
 *   return () => [name, schema, callback];
 * };
 * ```
 */
export interface PluginContext {

  /**
   * Utility functions available to plugins
   */
  utils: {

    /**
     * Memoization utility for caching function results
     *
     * @template TArgs - Array of argument types for the function
     * @template TReturn - Return type of the function
     * @param func - Function to memoize
     * @param options - Memoization options (cache limit, TTL, etc.)
     * @returns Memoized version of the function
     *
     * @example
     * ```typescript
     * const memoFetch = context.utils.memo(
     *   async (url: string) => fetch(url).then(r => r.text()),
     *   { cacheLimit: 50, expire: 5 * 60 * 1000 }
     * );
     * ```
     */
    memo: <TArgs extends unknown[], TReturn>(
      func: (...args: TArgs) => TReturn,
      options?: MemoOptions
    ) => (...args: TArgs) => TReturn;

    /**
     * Fetch content from a URL (memoized)
     *
     * @param url - URL to fetch
     * @returns Promise resolving to response text
     * @throws Error if fetch fails or times out
     *
     * @example
     * ```typescript
     * const content = await context.utils.fetchUrl(
     *   'https://raw.githubusercontent.com/org/repo/main/docs.md'
     * );
     * ```
     */
    fetchUrl: (url: string) => Promise<string>;

    /**
     * Read content from a local file (memoized)
     *
     * @param filePath - Path to file (absolute or relative)
     * @returns Promise resolving to file contents as UTF-8 string
     * @throws Error if file doesn't exist or cannot be read
     *
     * @example
     * ```typescript
     * const content = await context.utils.readFile('./data/config.json');
     * ```
     */
    readFile: (filePath: string) => Promise<string>;
  };

  /**
   * Configuration values available to plugins
   */
  config: {

    /**
     * Name of the MCP server
     */
    serverName: string;

    /**
     * Version of the MCP server
     */
    serverVersion: string;

    /**
     * Default separator for joining multiple content strings
     * (typically '\n\n---\n\n')
     */
    separator: string;

    /**
     * Plugin-specific options from configuration
     *
     * @example
     * ```json
     * {
     *   "plugins": [{
     *     "package": "@org/my-plugin",
     *     "options": { "cacheLimit": 100 }
     *   }]
     * }
     * ```
     */
    pluginOptions?: Record<string, any>;
  };

  /**
   * MCP SDK types for error handling
   */
  types: {

    /**
     * MCP Error class for throwing standardized errors
     *
     * @example
     * ```typescript
     * throw new context.types.McpError(
     *   context.types.ErrorCode.InvalidParams,
     *   'Missing required parameter: query'
     * );
     * ```
     */
    McpError: typeof McpError;

    /**
     * MCP Error codes enum
     *
     * Available codes:
     * - InvalidParams
     * - MethodNotFound
     * - InternalError
     * - ParseError
     * - InvalidRequest
     */
    ErrorCode: typeof ErrorCode;
  };
}

// =============================================================================
// Plugin Factory Types
// =============================================================================

/**
 * Plugin factory function signature
 *
 * This is the main entry point for a plugin. It receives a restricted
 * context and returns a tool creator function.
 *
 * @param context - Restricted plugin context (frozen)
 * @returns Tool creator function that returns [name, schema, callback]
 *
 * @example
 * ```typescript
 * import type { PluginFactory } from '@jephilli-patternfly-docs/mcp/types';
 *
 * const myPlugin: PluginFactory = (context) => {
 *   // Plugin initialization logic here
 *   const cache = new Map();
 *
 *   console.log(`Plugin loaded for ${context.config.serverName}`);
 *
 *   return () => {
 *     // Tool registration logic here
 *     const callback = async (args: ToolCallbackArgs) => {
 *       const { query } = args;
 *
 *       // Use context utilities
 *       const data = await context.utils.fetchUrl(
 *         `https://api.example.com/search?q=${query}`
 *       );
 *
 *       return {
 *         content: [{
 *           type: 'text',
 *           text: data
 *         }]
 *       };
 *     };
 *
 *     return [
 *       'myTool',
 *       {
 *         description: 'My custom tool',
 *         inputSchema: {
 *           query: { type: 'string', description: 'Search query' }
 *         }
 *       },
 *       callback
 *     ];
 *   };
 * };
 *
 * export default myPlugin;
 * ```
 */
export type PluginFactory = (context: PluginContext) => McpToolCreator;

// =============================================================================
// Plugin Metadata Types
// =============================================================================

/**
 * Optional metadata that plugins can export
 *
 * @example
 * ```typescript
 * export const metadata: PluginMetadata = {
 *   name: '@patternfly/mcp-tool-component-search',
 *   version: '1.0.0',
 *   description: 'Search PatternFly components by keyword',
 *   author: 'PatternFly Team',
 *   homepage: 'https://github.com/patternfly/mcp-tool-component-search'
 * };
 * ```
 */
export interface PluginMetadata {

  /**
   * Plugin package name (typically matches npm package name)
   */
  name: string;

  /**
   * Plugin version (semver)
   */
  version: string;

  /**
   * Short description of plugin functionality
   */
  description?: string;

  /**
   * Plugin author name or organization
   */
  author?: string;

  /**
   * Plugin homepage or repository URL
   */
  homepage?: string;
}

/**
 * Complete plugin module structure
 *
 * Plugins must export a default factory function and may optionally
 * export metadata.
 *
 * @example
 * ```typescript
 * // my-plugin/src/index.ts
 * import type { PluginFactory, PluginMetadata } from '@jephilli-patternfly-docs/mcp/types';
 *
 * const plugin: PluginFactory = (context) => {
 *   return () => [name, schema, callback];
 * };
 *
 * export default plugin;
 *
 * export const metadata: PluginMetadata = {
 *   name: '@org/my-plugin',
 *   version: '1.0.0'
 * };
 * ```
 */
export interface PluginModule {

  /**
   * Default export: plugin factory function
   */
  default: PluginFactory;

  /**
   * Optional named export: plugin metadata
   */
  metadata?: PluginMetadata;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Plugin configuration in config file or CLI
 *
 * @example
 * ```json
 * {
 *   "package": "@patternfly/mcp-tool-component-search",
 *   "enabled": true,
 *   "options": {
 *     "cacheLimit": 50,
 *     "apiKey": "secret"
 *   }
 * }
 * ```
 */
export interface PluginConfig {

  /**
   * NPM package name of the plugin
   *
   * Can be:
   * - Published NPM package: "@patternfly/mcp-tool-search"
   * - Local path: "../my-plugin"
   * - GitHub URL: "github:org/repo"
   */
  package: string;

  /**
   * Whether the plugin is enabled (default: true)
   *
   * Set to false to temporarily disable without removing from config
   */
  enabled: boolean;

  /**
   * Plugin-specific options
   *
   * Passed to plugin via context.config.pluginOptions
   */
  options?: Record<string, any>;
}

/**
 * Server configuration file structure
 *
 * Supports loading from JSON file via --config flag
 *
 * @example
 * ```json
 * {
 *   "server": {
 *     "name": "my-patternfly-server",
 *     "version": "1.0.0"
 *   },
 *   "plugins": [
 *     {
 *       "package": "@patternfly/mcp-tool-component-search",
 *       "enabled": true,
 *       "options": { "cacheLimit": 50 }
 *     }
 *   ],
 *   "cache": {
 *     "resourceMemoOptions": {
 *       "fetchUrl": {
 *         "cacheLimit": 100,
 *         "expire": 180000
 *       }
 *     }
 *   }
 * }
 * ```
 */
export interface ServerConfig {

  /**
   * Server identification (optional, overrides defaults)
   */
  server?: {

    /**
     * Server name (overrides package.json name)
     */
    name?: string;

    /**
     * Server version (overrides package.json version)
     */
    version?: string;
  };

  /**
   * Plugin configuration array
   */
  plugins?: PluginConfig[];

  /**
   * Cache configuration (optional, overrides defaults)
   */
  cache?: {

    /**
     * Resource-level memoization options
     * (shared across all tools and plugins)
     */
    resourceMemoOptions?: {
      fetchUrl?: {
        cacheLimit?: number;
        expire?: number;
      };
      readFile?: {
        cacheLimit?: number;
        expire?: number;
      };
    };

    /**
     * Tool-level memoization options
     * (tool-specific caches)
     */
    toolMemoOptions?: {
      usePatternFlyDocs?: {
        cacheLimit?: number;
        expire?: number;
      };
      fetchDocs?: {
        cacheLimit?: number;
        expire?: number;
      };
    };
  };
}


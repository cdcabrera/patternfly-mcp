import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { isPlainObject } from './server.helpers';
import { type McpToolCreator, type McpTool } from './server';
import { type GlobalOptions } from './options';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { formatUnknownError } from './logger';

/**
 * A normalized tool entry for normalizing values for strings and tool creators.
 *
 * @property type - Classification of the entry (file, package, creator, tuple, object, invalid)
 * @property index - The original input index (for diagnostics)
 * @property original - The original input value
 * @property value - The final consumer value (string or creator)
 * @property toolName - The tool name for tuple/object/function entries
 * @property normalizedUrl - The normalized file URL for file entries
 * @property fsReadDir - The directory to include in allowlist for file, or package, entries
 * @property isUrlLike - File, or package, URL indicator
 * @property isFilePath - File, or package, path indicator
 * @property isFileUrl - File, or package, URL indicator
 * @property error - Error message for invalid entries
 */
type NormalizedToolEntry = {
  type: 'file' | 'package' | 'creator' | 'tuple' | 'object' | 'invalid';
  index: number;
  original: unknown;
  value: string | McpToolCreator;
  toolName?: string;
  normalizedUrl?: string;
  fsReadDir?: string | undefined;
  isUrlLike?: boolean;
  isFilePath?: boolean;
  isFileUrl?: boolean;
  error?: string;
};

/**
 * A file or package tool entry for normalizing values for strings.
 */
type FileEntry = Pick<NormalizedToolEntry, 'type' | 'original' | 'value' | 'isUrlLike' | 'isFilePath' | 'isFileUrl' | 'normalizedUrl' | 'fsReadDir' | 'error'>;

/**
 * A general tool entry for normalizing values for creators.
 */
type CreatorEntry = Pick<NormalizedToolEntry, 'type' | 'original' | 'value' | 'toolName'>;

/**
 * An MCP tool "wrapper", or "creator".
 *
 * @alias McpToolCreator
 */
type ToolCreator = McpToolCreator;

/**
 * An MCP tool. Standalone or returned by `createMcpTool`.
 *
 * @alias McpTool
 */
type Tool = McpTool;

/**
 * Author-facing "tools as plugins" surface.
 *
 * A tool module is a flexible type that supports either a single string identifier,
 * a specific tool creator, or multiple tool creators.
 *
 * - A `file path` or `file URL` string, that refers to the name or identifier of a local ESM tool package.
 * - A `package name` string, that refers to the name or identifier of a local ESM tool package.
 * - An `McpTool`, a tuple of `[toolName, toolConfig, toolHandler]`
 * - An `McpToolCreator`, a function that returns an `McpTool`.
 * - An array of `McpToolCreator` functions.
 */
type ToolModule = (string | McpTool | McpToolCreator | McpToolCreator[])[] | string | McpTool | McpToolCreator | McpToolCreator[];

// type ToolModule = string | McpTool | McpToolCreator | (string | McpTool | McpToolCreator)[];
// type ToolModules = string | McpTool | McpToolCreator | McpToolCreator[];

/**
 * Author-facing tool config. The handler may be async or sync.
 *
 * @template TArgs The type of arguments expected by the tool (optional).
 * @template TResult The type of result returned by the tool (optional).
 *
 * @property name - Name of the tool
 * @property description - Description of the tool
 * @property inputSchema - JSON Schema or Zod schema describing the arguments expected by the tool
 * @property {(args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult} handler - Tool handler
 *     - `args` are returned by the tool's `inputSchema`'
 *     - `options` are currently unused and reserved for future use.
 */
type ToolConfig<TArgs = any, TResult = any> = {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema or Zod schema
  handler: (args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult;
};

/**
 * Author-facing multi-tool config.
 *
 * @property [name] - Optional name for the group of tools
 * @property {ToolConfig} tools - Array of tool configs
 */
type MultiToolConfig = {
  name?: string | undefined;
  tools: ToolConfig[]
};

/**
 * Check if a string looks like a file path.
 *
 * @param str
 * @returns Confirmation that the string looks like a file path.
 */
const isFilePath = (str: string): boolean =>
  str.startsWith('./') || str.startsWith('../') || str.startsWith('/') || /^[A-Za-z]:[\\/]/.test(str);

/**
 * Check if a string looks like a URL.
 *
 * @param str
 * @returns Confirmation that the string looks like a URL.
 */
const isUrlLike = (str: string) =>
  /^(file:|https?:|data:|node:)/i.test(str);

/**
 * Minimally validate a tool config. Is it a tuple we expect?
 *
 * @param config
 */
const isToolTuple = (config: unknown) => {
  const isArray = Array.isArray(config) && config.length === 3;

  return (
    isArray &&
    typeof config[0] === 'string' &&
    isPlainObject(config[1]) &&
    typeof config[1].description === 'string' &&
    config[1].description.trim().length > 0 &&
    config[1].inputSchema !== undefined &&
    config[1].inputSchema !== null &&
    typeof config[1].inputSchema === 'object' &&
    typeof config[2] === 'function'
  );
};

/**
 * Minimally validate a tool config. Is it an object we expect?
 *
 * @param config
 */
const isToolObject = (config: unknown) => {
  const isObj = isPlainObject(config);

  return (
    isObj &&
    typeof config.name === 'string' &&
    typeof config.handler === 'function' &&
    typeof config.description === 'string' &&
    config.description.trim().length > 0 &&
    config.inputSchema !== undefined &&
    config.inputSchema !== null &&
    typeof config.inputSchema === 'object'
  );
};

/**
 * Minimally validate a tool config.  Is it a function we expect?
 *
 * @param config
 */
const isToolFunction = (config: unknown) => typeof config === 'function';

/**
 * Minimally validate a tool config. Is it a string we expect?
 *
 * @param config
 */
const isToolFilePackage = (config: unknown) => typeof config === 'string';

/**
 * Normalize a tuple config into a tool creator function.
 *
 * @param config
 */
const normalizeTuple = (config: McpTool): CreatorEntry => {
  const updatedTuple = config;
  const creator: ToolCreator = () => updatedTuple;

  (creator as any).toolName = updatedTuple[0];

  return {
    original: config,
    toolName: updatedTuple[0],
    type: 'tuple',
    value: creator
  };
};

/**
 * Normalize an object config into a tool creator function.
 *
 * @param config
 */
const normalizeObject = (config: any): CreatorEntry => {
  const updatedObj = config;
  const creator: ToolCreator = () => [
    updatedObj.name,
    {
      description: updatedObj.description,
      inputSchema: updatedObj.inputSchema
    },
    updatedObj.handler
  ];

  (creator as any).toolName = updatedObj.name;

  return {
    original: config,
    toolName: updatedObj.name,
    type: 'object',
    value: creator
  };
};

const normalizeFunction = (config: any): CreatorEntry => (
  {
    original: config,
    toolName: (config as any).toolName,
    type: 'creator',
    value: config
  }
);

/**
 * Normalize a file or package tool config into a file entry.
 *
 * @param config - The file, or package, configuration to normalize.
 * @param options - Optional settings
 * @param options.contextPath - The context path to use for resolving file paths.
 * @param options.contextUrl - The context URL to use for resolving file paths.
 */
const normalizeFilePackage = (
  config: string,
  { contextPath, contextUrl }: { contextPath?: string, contextUrl?: string } = {}
): FileEntry => {
  const entry: Partial<NormalizedToolEntry> = { isUrlLike: isUrlLike(config), isFilePath: isFilePath(config) };

  let isFileUrl = config.startsWith('file:');
  let normalizedUrl = config;
  let fsReadDir: string | undefined = undefined;
  let type: NormalizedToolEntry['type'] = 'package'; // default classification for non-file strings
  let err: string | undefined;

  try {
    // Case 1: already a file URL
    if (isFileUrl) {
      // Best-effort derive fsReadDir for allow-listing
      try {
        const resolvedPath = fileURLToPath(config);

        fsReadDir = dirname(resolvedPath);
      } catch {}
      type = 'file';

      return {
        ...entry,
        normalizedUrl,
        fsReadDir,
        isFileUrl,
        original: config,
        type,
        value: config
      };
    }

    // Case 2: looks like a filesystem path -> resolve
    if (entry.isFilePath) {
      try {
        if (contextPath !== undefined && contextUrl !== undefined) {
          const url = import.meta.resolve(config, contextUrl);

          if (url.startsWith('file:')) {
            const resolvedPath = fileURLToPath(url);

            fsReadDir = dirname(resolvedPath);
            normalizedUrl = pathToFileURL(resolvedPath).href;
            isFileUrl = true;
            type = 'file';
          }
        }

        // Fallback if resolve() path failed or not file:
        if (type !== 'file') {
          const resolvedPath = isAbsolute(config) ? config : resolve(contextPath as string, config);

          fsReadDir = dirname(resolvedPath);
          normalizedUrl = pathToFileURL(resolvedPath).href;
          isFileUrl = true;
          type = 'file';
        }
      } catch (error) {
        err = `Failed to resolve file path: ${config} ${formatUnknownError(error)}`;

        return {
          ...entry,
          normalizedUrl,
          fsReadDir,
          isFileUrl,
          original: config,
          type: 'invalid',
          value: config,
          error: err
        };
      }

      // Resolved file OK
      return {
        ...entry,
        normalizedUrl,
        fsReadDir,
        isFileUrl,
        original: config,
        type,
        value: config
      };
    }

    // Case 3: non-file string -> keep as-is (package name or other URL-like spec)
    // Note: http(s) module specs are not supported by Node import and will surface as load warnings in the child.
    return {
      ...entry,
      normalizedUrl,
      fsReadDir,
      isFileUrl: false,
      original: config,
      type: 'package',
      value: config
    };
  } catch (error) {
    err = `Failed to handle spec: ${config} ${formatUnknownError(error)}`;

    return {
      ...entry,
      normalizedUrl,
      fsReadDir,
      isFileUrl,
      original: config,
      type: 'invalid',
      value: config,
      error: err
    };
  }
};

/**
 * Normalize tool configuration(s) into a normalized tool entry.
 *
 * @param config - The configuration(s) to normalize.
 * @param options - Optional settings
 * @param options.contextPath - The context path to use for resolving file paths.
 * @param options.contextUrl - The context URL to use for resolving file paths.
 * @returns An array of normalized tool entries.
 */
const normalizeTools = (config: any, {
  contextPath = DEFAULT_OPTIONS.contextPath,
  contextUrl = DEFAULT_OPTIONS.contextUrl
}: { contextPath?: string, contextUrl?: string } = {}): NormalizedToolEntry[] => {
  const updatedConfigs = (Array.isArray(config) && config) || (config && [config]) || [];
  const flattenedConfigs = updatedConfigs.flatMap((item: any) => (Array.isArray(item) && item) || [item]);
  const normalizedConfigs: NormalizedToolEntry[] = [];

  flattenedConfigs.forEach((config: any, index: number) => {
    if (isToolFunction(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeFunction(config)
      });

      return;
    }

    if (isToolFilePackage(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeFilePackage(config, { contextPath, contextUrl })
      });

      return;
    }

    if (isToolTuple(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeTuple(config)
      });

      return;
    }

    if (isToolObject(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeObject(config)
      });

      return;
    }

    const err = `createMcpTool: invalid configuration used at index ${index}: Unsupported type ${typeof config}`;

    normalizedConfigs.push({
      index,
      original: config,
      type: 'invalid',
      value: err,
      error: err
    });
  });

  return normalizedConfigs;
};

/**
 * Memoize the `normalizeTools` function.
 */
normalizeTools.memo = memo(normalizeTools, { cacheErrors: false });

/**
 * Author-facing helper for creating an MCP tool configuration list for Patternfly MCP server.
 *
 * @example A single file path string
 * export default createMcpTool('./a/file/path.mjs');
 *
 * @example A single package string
 * export default createMcpTool('@my-org/my-tool');
 *
 * @example A single tool configuration tuple
 * export default createMcpTool(['myTool', { description: 'My tool description' }, (args) => { ... }]);
 *
 * @example A single tool creator function
 * export default createMcpTool(() => ['myTool', { description: 'My tool description' }, (args) => { ... }]);
 *
 * @example A single tool configuration object
 * export default createMcpTool({ name: 'myTool', description: 'My tool description', inputSchema: {}, handler: (args) => { ... } });
 *
 * @example A multi-tool configuration array/list
 * export default createMcpTool(['./a/file/path.mjs', { name: 'myTool', description: 'My tool description', inputSchema: {}, handler: (args) => { ... } }]);
 *
 * @param config - The configuration for creating the tool(s). It can be:
 *   - A single string representing the name of a local ESM predefined tool (`file path string` or `file URL string`). Limited to Node.js 22+
 *   - A single string representing the name of a local ESM tool package (`package string`). Limited to Node.js 22+
 *   - A single inline tool configuration tuple (`Tool`).
 *   - A single inline tool creator function returning a tuple (`ToolCreator`).
 *   - A single inline tool configuration object (`ToolConfig`).
 *   - An array of the aforementioned configuration types in any combination.
 * @returns An array of strings and/or tool creators that can be applied to the MCP server `toolModules` option.
 *
 * @throws {Error} If a configuration is invalid, an error is thrown on the first invalid entry.
 */
const createMcpTool = (config: unknown): ToolModule => {
  const entries = normalizeTools(config);
  const err = entries.find(entry => entry.type === 'invalid');

  if (err?.error) {
    throw new Error(err.error);
  }

  return entries.map(entry => entry.value);
};

export {
  createMcpTool,
  isFilePath,
  isUrlLike,
  isToolFilePackage,
  isToolFunction,
  isToolObject,
  isToolTuple,
  normalizeFilePackage,
  normalizeTuple,
  normalizeObject,
  normalizeFunction,
  normalizeTools,
  type MultiToolConfig,
  type NormalizedToolEntry,
  type ToolCreator,
  type Tool,
  type ToolConfig,
  type ToolModule
};

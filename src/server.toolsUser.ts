import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { isPlainObject } from './server.helpers';
import { type McpToolCreator, type McpTool } from './server';
import { type GlobalOptions } from './options';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { formatUnknownError } from './logger';
// import { type ToolOptions } from './options.tools';

type NormalizedToolEntry = {
  // classification
  type: 'file' | 'package' | 'creator' | 'tuple' | 'object' | 'invalid';
  // original input and position (for diagnostics)
  index: number;
  original: unknown;

  // final consumer value (what the public normalizer exposes)
  value: string | McpToolCreator; // string for externals, creator for inline

  // derived metadata (avoid re-looping)
  toolName?: string; // derived from tuple/object or creator.toolName

  // File, package values
  normalizedUrl?: string; // file:// URL for local paths (if sourceKind file)
  absPath?: string; // absolute file path (if resolved)
  fsReadDir?: string | undefined; // directory to include in allowlist (if resolved file)
  isUrlLike?: boolean; // cached predicate
  isFilePath?: boolean; // cached predicate
  isFileUrl?: boolean;

  // health and provenance
  // warnings?: string[];
  error?: string; // present only when we choose to continue in permissive modes
};

/**
 * A file or package tool entry, with normalized values.
 */
type FileCreator = Pick<NormalizedToolEntry, 'type' | 'original' | 'value' | 'isUrlLike' | 'isFilePath' | 'isFileUrl' | 'normalizedUrl' | 'fsReadDir' | 'error'>;

/**
 * A general tool entry, with normalized values.
 */
type PartialCreator = Pick<NormalizedToolEntry, 'type' | 'original' | 'value' | 'toolName'>;

/**
 * An MCP tool "wrapper", or "creator", from `createMcpTool`.
 *
 * Passed back to `toolModules` in `PfMcpOptions` to register a tool.
 *
 * @alias McpToolCreator
 */
type ToolCreator = McpToolCreator;

/*
type FileCreator = {
  fsReadDir?: string | undefined;
  isUrlLike?: boolean;
  isFilePath?: boolean;
  isFileUrl: boolean;
  normalizedUrl: string;
  original: string;
  type: 'file' | 'package';
  value: string;
};
*/
// type ToolCreator = (options?: ToolOptions) => McpTool;

type Tool = McpTool;

/**
 * Author-facing "tools as plugins" surface.
 *
 * A tool plugin is a flexible type that supports either a single string identifier,
 * a specific tool creator, or multiple tool creators.
 *
 * - A `file path` or `file URL` string, that refers to the name or identifier of a predefined tool.
 * - An `McpToolCreator`, a function that creates the tool.
 * - An array of `McpToolCreator` functions.
 */
// type ToolPlugin = string | McpToolCreator | McpToolCreator[];
type ToolPlugin = string | McpToolCreator | McpToolCreator[];

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
 * Strict validation; converts to McpToolCreator.
 * Public code-level authoring spec = same as ToolConfig. Optional `kind` is allowed but ignored.
 */
type ToolObjectConfig<TArgs = any, TResult = any> = ToolConfig<TArgs, TResult> & { kind?: 'handler' };

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
const isToolTuple = (config: any) => {
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
const isToolObject = (config: any) => {
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
const isToolFunction = (config: any) => typeof config === 'function';

/**
 * Minimally validate a tool config. Is it a string we expect?
 *
 * @param config
 */
const isToolFilePackage = (config: any) => typeof config === 'string';

/**
 * Normalize a tuple config into a tool creator function.
 *
 * @param config
 */
const tupleToCreator = (config: McpTool): PartialCreator => {
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
const objectToCreator = (config: any): PartialCreator => {
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

const functionToCreator = (config: any): PartialCreator => (
  {
    original: config,
    toolName: (config as any).toolName,
    type: 'creator',
    value: config
  }
);

const filePackageToCreator = (config: string, { contextPath, contextUrl }:{ contextPath?: string, contextUrl?: string } = {}): FileCreator => {
  const entry: Partial<NormalizedToolEntry> = { isUrlLike: isUrlLike(config), isFilePath: isFilePath(config) };
  let isFileUrl = config.startsWith('file:');
  let normalizedUrl = config;
  let fsReadDir = undefined;
  let isError = true;
  let err = `Failed to resolve file path; ${config}`;

  if (entry.isFilePath && contextPath !== undefined && contextUrl !== undefined) {
    try {
      const url = import.meta.resolve(config, contextUrl);

      if (url.startsWith('file:')) {
        const resolvedPath = fileURLToPath(url);

        fsReadDir = dirname(resolvedPath);
        normalizedUrl = pathToFileURL(resolvedPath).href;
        isFileUrl = normalizedUrl.startsWith('file:');
        isError = false;
      }
    } catch {
      try {
        const resolvedPath = isAbsolute(config) ? config : resolve(contextPath, config);

        fsReadDir = dirname(resolvedPath);
        normalizedUrl = pathToFileURL(resolvedPath).href;
        isFileUrl = normalizedUrl.startsWith('file:');
        isError = false;
      } catch (error) {
        err = `Failed to resolve file path: ${config} ${formatUnknownError(error)}`;
      }
    }

    // normalizedUrl = pathToFileURL(abs).href;
    // fsReadDir = dirname(abs);
    // isFileUrl = normalizedUrl.startsWith('file:');
  }

  return {
    ...entry,
    normalizedUrl,
    fsReadDir,
    isFileUrl,
    original: config,
    type: (isError && 'invalid') || (isFileUrl && 'file') || 'package',
    value: config,
    error: err
  };
};

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
        ...functionToCreator(config)
      });
    }

    if (isToolFilePackage(config)) {
      normalizedConfigs.push({
        index,
        ...filePackageToCreator(config, { contextPath, contextUrl })
      });
    }

    if (isToolTuple(config)) {
      normalizedConfigs.push({
        index,
        ...tupleToCreator(config)
      });
    }

    if (isToolObject(config)) {
      normalizedConfigs.push({
        index,
        ...objectToCreator(config)
      });
    }

    const err = `createMcpTool: invalid configuration used at index ${index}: Unsupported type ${typeof config}`;

    normalizedConfigs.push({
      index,
      original: config,
      type: 'invalid',
      value: err,
      // value: () => {
      //  throw new Error(`Unsupported type ${typeof config}`, { cause: [config] });
      // },
      error: err
    });

    return undefined;
  });

  return normalizedConfigs;
};

normalizeTools.memo = memo(normalizeTools, { cacheErrors: false });

/*
const toolWrapper = (config: any, name: string, type: 'string' | 'func' | 'tuple' | 'obj'): McpToolCreator => {
  const wrapper = () => config;

  wrapper.toolType = name;
  wrapper.toolName = type;

  return wrapper;
};
 */

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
 * @template TArgs The type of arguments expected by the tool (optional).
 * @template TResult The type of result returned by the tool (optional).
 * @param config - The configuration for creating the tool(s). It can be:
 *   - A single string representing the name of a local ESM predefined tool (`file path string` or `file URL string`). Limited to Node.js 22+
 *   - A single string representing the name of a local ESM tool package (`package string`). Limited to Node.js 22+
 *   - A single inline tool configuration tuple (`Tool`).
 *   - A single inline tool creator function returning a tuple (`ToolCreator`).
 *   - A single inline tool configuration object (`ToolConfig`).
 *   - An array of the aforementioned configuration types in any combination.
 * @returns An array of tool creators to apply to the MCP server `toolModules` option.
 *
 * @throws {Error} If the configuration is invalid, an error is thrown.
 */
const createMcpTool = (config: unknown): Array<string | ToolCreator> => {
  const entries = normalizeTools(config);
  const err = entries.find(entry => entry.type === 'invalid');

  if (err?.error) {
    throw new Error(err.error);
  }

  return entries.map(entry => entry.value);
};

export {
  createMcpTool,
  isToolFilePackage,
  isToolFunction,
  isToolObject,
  isToolTuple,
  normalizeTools,
  type MultiToolConfig,
  type ToolCreator,
  type Tool,
  type ToolConfig,
  type ToolPlugin,
  type ToolObjectConfig
};

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import packageJson from '../package.json';

/**
 * CLI options that users can set via command line arguments
 */
interface CliOptions {

  /**
   * Use llms.txt files from local llms-files directory instead of live documentation
   */
  docsHost?: boolean;

  /**
   * Path to JSON configuration file for server and plugin settings
   */
  config?: string;

  /**
   * Comma-separated list of plugin package names to load
   * Example: "@patternfly/mcp-tool-search,@org/my-plugin"
   */
  plugins?: string;

  /**
   * Array of validated plugin names (invalid ones filtered out)
   * This is populated by validatePlugins() during parsing
   */
  validatedPlugins?: string[];

  /**
   * Enable verbose logging for debugging
   */
  verbose?: boolean;
}

/**
 * Application defaults (not user-configurable)
 */
interface AppDefaults {
  resourceMemoOptions: typeof RESOURCE_MEMO_OPTIONS;
  toolMemoOptions: typeof TOOL_MEMO_OPTIONS;
  pfExternal: string;
  pfExternalCharts: string;
  pfExternalChartsComponents: string;
  pfExternalChartsDesign: string;
  pfExternalDesign: string;
  pfExternalDesignComponents: string;
  pfExternalDesignLayouts: string;
  pfExternalAccessibility: string;
  separator: string;
  urlRegex: RegExp;
  name: string;
  version: string;
  repoName: string | undefined;
  contextPath: string;
  docsPath: string;
  llmsFilesPath: string;
}

/**
 * Frozen options object (immutable configuration)
 */
interface GlobalOptions extends CliOptions, AppDefaults {
  // This will be frozen and immutable
}

/**
 * Default separator for joining multiple document contents
 */
const DEFAULT_SEPARATOR = '\n\n---\n\n';

/**
 * Resource-level memoization options
 */
const RESOURCE_MEMO_OPTIONS = {
  fetchUrl: {
    cacheLimit: 100,
    expire: 3 * 60 * 1000, // 3 minute sliding cache
    cacheErrors: false
  },
  readFile: {
    cacheLimit: 50,
    expire: 2 * 60 * 1000, // 2 minute sliding cache
    cacheErrors: false
  }
};

/**
 * Tool-specific memoization options
 */
const TOOL_MEMO_OPTIONS = {
  usePatternFlyDocs: {
    cacheLimit: 10,
    expire: 1 * 60 * 1000, // 1 minute sliding cache
    cacheErrors: false
  },
  fetchDocs: {
    cacheLimit: 15,
    expire: 1 * 60 * 1000, // 1 minute sliding cache
    cacheErrors: false
  }
};

/**
 * URL regex pattern for detecting external URLs
 */
const URL_REGEX = /^(https?:)\/\//i;

/**
 * PatternFly docs root URL
 */
const PF_EXTERNAL = 'https://raw.githubusercontent.com/patternfly/patternfly-org/refs/heads/main/packages/documentation-site/patternfly-docs/content';

/**
 * PatternFly design guidelines URL
 */
const PF_EXTERNAL_DESIGN = `${PF_EXTERNAL}/design-guidelines`;

/**
 * PatternFly design guidelines' components' URL
 */
const PF_EXTERNAL_DESIGN_COMPONENTS = `${PF_EXTERNAL_DESIGN}/components`;

/**
 * PatternFly design guidelines' layouts' URL
 */
const PF_EXTERNAL_DESIGN_LAYOUTS = `${PF_EXTERNAL_DESIGN}/layouts`;

/**
 * PatternFly accessibility URL
 */
const PF_EXTERNAL_ACCESSIBILITY = `${PF_EXTERNAL}/accessibility`;

/**
 * PatternFly charts root URL
 */
const PF_EXTERNAL_CHARTS = 'https://raw.githubusercontent.com/patternfly/patternfly-react/refs/heads/main/packages/react-charts/src';

/**
 * PatternFly charts' components' URL
 */
const PF_EXTERNAL_CHARTS_COMPONENTS = `${PF_EXTERNAL_CHARTS}/victory/components`;

/**
 * PatternFly charts' design guidelines URL
 */
const PF_EXTERNAL_CHARTS_DESIGN = `${PF_EXTERNAL_CHARTS}/charts`;

/**
 * Global configuration options object.
 *
 * @type {GlobalOptions}
 * @property {CliOptions.docsHost} [docsHost] - Flag indicating whether to use the docs-host.
 * @property {string} pfExternal - PatternFly external docs URL.
 * @property {string} pfExternalCharts - PatternFly external charts URL.
 * @property {string} pfExternalChartsComponents - PatternFly external charts components URL.
 * @property {string} pfExternalChartsDesign - PatternFly external charts design guidelines URL.
 * @property {string} pfExternalDesign - PatternFly external design guidelines URL.
 * @property {string} pfExternalDesignComponents - PatternFly external design guidelines components URL.
 * @property {string} pfExternalDesignLayouts - PatternFly external design guidelines layouts URL.
 * @property {string} pfExternalAccessibility - PatternFly external accessibility URL.
 * @property {typeof RESOURCE_MEMO_OPTIONS} resourceMemoOptions - Resource-level memoization options.
 * @property {typeof TOOL_MEMO_OPTIONS} toolMemoOptions - Tool-specific memoization options.
 * @property {string} separator - Default string delimiter.
 * @property {RegExp} urlRegex - Regular expression pattern for URL matching.
 * @property {string} name - Name of the package.
 * @property {string} version - Version of the package.
 * @property {string} repoName - Name of the repository.
 * @property {string} contextPath - Current working directory.
 * @property {string} docsPath - Path to the documentation directory.
 * @property {string} llmsFilesPath - Path to the LLMs files directory.
 */
const OPTIONS: GlobalOptions = {
  pfExternal: PF_EXTERNAL,
  pfExternalCharts: PF_EXTERNAL_CHARTS,
  pfExternalChartsComponents: PF_EXTERNAL_CHARTS_COMPONENTS,
  pfExternalChartsDesign: PF_EXTERNAL_CHARTS_DESIGN,
  pfExternalDesign: PF_EXTERNAL_DESIGN,
  pfExternalDesignComponents: PF_EXTERNAL_DESIGN_COMPONENTS,
  pfExternalDesignLayouts: PF_EXTERNAL_DESIGN_LAYOUTS,
  pfExternalAccessibility: PF_EXTERNAL_ACCESSIBILITY,
  resourceMemoOptions: RESOURCE_MEMO_OPTIONS,
  toolMemoOptions: TOOL_MEMO_OPTIONS,
  separator: DEFAULT_SEPARATOR,
  urlRegex: URL_REGEX,
  name: packageJson.name,
  version: packageJson.version,
  repoName: process.cwd()?.split?.('/')?.pop?.()?.trim?.(),
  contextPath: (process.env.NODE_ENV === 'local' && '/') || process.cwd(),
  docsPath: (process.env.NODE_ENV === 'local' && '/documentation') || join(process.cwd(), 'documentation'),
  llmsFilesPath: (process.env.NODE_ENV === 'local' && '/llms-files') || join(process.cwd(), 'llms-files')
};

/**
 * Validate config file path if provided
 *
 * @param configPath - Path to config file
 * @throws Error if config file doesn't exist or isn't JSON
 */
const validateConfigPath = (configPath: string): void => {
  if (!configPath) {
    return;
  }

  try {
    const resolvedPath = resolve(configPath);

    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }

    if (!resolvedPath.endsWith('.json')) {
      throw new Error(`Config file must be a JSON file: ${resolvedPath}`);
    }

    // Try to parse to ensure it's valid JSON
    const content = readFileSync(resolvedPath, 'utf-8');

    JSON.parse(content);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid config file: ${error.message}`);
    }

    throw error;
  }
};

/**
 * Validate plugin names and return valid ones
 *
 * Invalid plugins are logged as warnings but don't stop execution.
 * Supports both npm packages and local file paths.
 *
 * @param plugins - Comma-separated plugin names or paths
 * @param options - Options for validation behavior
 * @param options.verbose - Enable verbose logging
 * @returns Array of valid plugin names/paths
 */
const validatePlugins = (
  plugins: string,
  { verbose = false }: { verbose?: boolean } = {}
): string[] => {
  if (!plugins) {
    return [];
  }

  const pluginList = plugins.split(',').map(p => p.trim()).filter(Boolean);

  if (pluginList.length === 0) {
    console.warn('⚠️  Plugin list is empty');

    return [];
  }

  const validPlugins: string[] = [];

  // Validate each plugin name/path format
  for (const plugin of pluginList) {
    let isValid = false;
    let pluginType = '';

    // Check for local file path (relative or absolute)
    // Supports: ./path, ../path, /absolute/path, ~/path (Unix), C:\path (Windows)
    if (
      plugin.startsWith('./') ||
      plugin.startsWith('../') ||
      plugin.startsWith('/') ||
      plugin.startsWith('~/') ||
      /^[a-z]:\\/i.test(plugin) // Windows absolute paths (C:\, D:\, etc.)
    ) {
      isValid = true;
      pluginType = 'local path';
    } else if (/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(plugin)) {
      // Check for npm package name format
      // Allows: @scope/name, name, name-with-dashes, @scope/name-with-dashes
      isValid = true;
      pluginType = 'npm package';
    }

    if (!isValid) {
      console.error(`❌ Invalid plugin format, skipping: ${plugin}`);

      if (verbose) {
        console.error('   Valid formats:');
        console.error('     - npm package: @scope/package-name or package-name');
        console.error('     - local path: ./path/to/plugin, ../path/to/plugin, or /absolute/path');
      }
    } else {
      validPlugins.push(plugin);

      if (verbose) {
        console.info(`✓ Valid plugin (${pluginType}): ${plugin}`);
      }
    }
  }

  if (validPlugins.length === 0) {
    console.warn('⚠️  No valid plugins found in the provided list');
  }

  return validPlugins;
};

/**
 * Parse CLI arguments using Commander and return CLI options
 *
 * @param argv - Process arguments (defaults to process.argv)
 * @returns Parsed CLI options
 */
const parseCliOptions = (argv: string[] = process.argv): CliOptions => {
  const program = new Command();

  program
    .name(packageJson.name)
    .description(packageJson.description || 'PatternFly MCP Server')
    .version(packageJson.version)
    .option(
      '--docs-host',
      'Use llms.txt files from local llms-files directory instead of live documentation'
    )
    .option(
      '-c, --config <path>',
      'Path to JSON configuration file for server and plugin settings'
    )
    .option(
      '-p, --plugins <packages>',
      'Comma-separated list of plugin package names to load (e.g., "@patternfly/mcp-tool-search,@org/my-plugin")'
    )
    .option(
      '-v, --verbose',
      'Enable verbose logging for debugging'
    )
    .allowUnknownOption(false)
    .showHelpAfterError(true)
    .exitOverride(); // Throw errors instead of calling process.exit() - better for testing

  // Parse arguments
  try {
    program.parse(argv);
  } catch (error) {
    // Re-throw Commander errors as regular errors for better test handling
    if (error instanceof Error) {
      throw new Error(error.message);
    }

    throw error;
  }

  const options = program.opts();

  // Validate config file (throws on error - config must be valid)
  if (options.config) {
    validateConfigPath(options.config);
  }

  // Validate plugins (filters invalid, returns valid list)
  let validatedPlugins: string[] = [];

  if (options.plugins) {
    validatedPlugins = validatePlugins(options.plugins, { verbose: options.verbose });
  }

  return {
    docsHost: options.docsHost,
    config: options.config,
    plugins: options.plugins, // Keep original string for now
    validatedPlugins, // Add validated array for Part 3
    verbose: options.verbose
  };
};

/**
 * Make global options immutable after combining CLI options with app defaults.
 *
 * @param cliOptions
 */
const freezeOptions = (cliOptions: CliOptions) => {
  Object.assign(OPTIONS, {
    ...cliOptions
  });

  return Object.freeze(OPTIONS);
};

export {
  parseCliOptions,
  freezeOptions,
  validateConfigPath,
  validatePlugins,
  OPTIONS,
  PF_EXTERNAL,
  PF_EXTERNAL_CHARTS,
  PF_EXTERNAL_CHARTS_COMPONENTS,
  PF_EXTERNAL_CHARTS_DESIGN,
  PF_EXTERNAL_DESIGN,
  PF_EXTERNAL_DESIGN_COMPONENTS,
  PF_EXTERNAL_DESIGN_LAYOUTS,
  PF_EXTERNAL_ACCESSIBILITY,
  RESOURCE_MEMO_OPTIONS,
  TOOL_MEMO_OPTIONS,
  DEFAULT_SEPARATOR,
  URL_REGEX,
  type CliOptions,
  type AppDefaults,
  type GlobalOptions
};

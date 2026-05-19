import {
  DEFAULT_OPTIONS,
  MODE_LEVELS,
  PLUGIN_ISOLATION,
  type DefaultOptions,
  type LoggingOptions,
  type HttpOptions,
  type ModeOptions,
  type ToolModule
} from './options.defaults';
import { type LogLevel, logSeverity } from './logger';
import { isUrl, portValid } from './server.helpers';
import { kebabToCamel } from './options.helpers';

/**
 * Session defaults, not user-configurable
 */
type AppSession = {
  readonly sessionId: string;
  readonly publicSessionId: string;
  readonly channelName: string
};

/**
 * Global options, convenience type for `DefaultOptions`
 */
type GlobalOptions = DefaultOptions;

/**
 * Convert specific options towards an "experimental-" prefix for consumers.
 *
 * @example Use
 * type ExperimentalKeys = 'loremOption' | 'ipsumOption';
 *
 * type PfMcpOptions = MakeExperimental<ProgrammaticOptions, ExperimentalKeys>;
 *
 * // Or directly
 * type PfMcpOptions = MakeExperimental<ProgrammaticOptions, 'loremOption' | 'ipsumOption'>;
 *
 * // Or allow empty
 * type PfMcpOptions = MakeExperimental<ProgrammaticOptions>
 */
type MakeExperimental<T, K extends keyof T = never> = T & {
  [P in K as `experimental${Capitalize<string & P>}`]?: T[P]
};

/**
 * Option overrides parsed from programmatic use. Exposed to the consumer/user.
 */
type ProgrammaticOptions = Partial<
  Omit<DefaultOptions, 'mode' | 'modeOptions' | 'http' | 'logging' | 'pluginIsolation' | 'toolModules'>
> & {
  mode?: DefaultOptions['mode'] | undefined;
  modeOptions?: Partial<ModeOptions> | undefined;
  http?: Partial<HttpOptions>;
  logging?: Partial<LoggingOptions>;
  pluginIsolation?: DefaultOptions['pluginIsolation'] | undefined;
  toolModules?: ToolModule | ToolModule[] | undefined;
};

/**
 * Options parsed from CLI arguments. Exposed to the consumer/user.
 *
 * @note `pluginIsolation` preset for external plugins (CLI-provided). If omitted, defaults
 * to 'strict' when external tools are requested, otherwise 'none'.
 */
type CliOptions = {
  mode?: DefaultOptions['mode'];
  modeOptions?: Partial<ModeOptions>;
  http?: Partial<HttpOptions>;
  isHttp: boolean;
  logging: Partial<LoggingOptions>;
  toolModules: string[];
  pluginIsolation: DefaultOptions['pluginIsolation'] | undefined;
};

/**
 * Parsed options return type. Separates regular options from experimental ones.
 *
 * @template T Passed standard options
 * @property {T} options - Standard parsed options
 * @property experimentalOptions - Experimental options
 */
type ParsedOptions<T> = {
  options: T;
  experimentalOptions: string[];
};

/**
 * Additive parse for CLI configuration options.
 * - Focuses on adding options into configuration.
 * - **IMPORTANT**: Exposed CLI options should be kebab-case, lowerCamel is reserved for
 *     internal distinction.
 * - Parses `process.argv` options
 * - Separates out supported `--experimental-` options from standard options.
 *
 * Available options:
 * - `--mode <mode>`: Specifies the mode of operation. Valid values are `cli`, `programmatic`, and `test`.
 * - `--mode-test-url`: Specifies the base URL for testing mode.
 * - `--log-level <level>`: Specifies the logging level. Valid values are `debug`, `info`, `warn`, and `error`.
 * - `--verbose`: Log all severity levels. Shortcut to set the logging level to `debug`.
 * - `--log-stderr`: Enables terminal logging of channel events
 * - `--log-protocol`: Enables MCP protocol logging. Forward server logs to MCP clients (requires advertising `capabilities.logging`).
 * - `--http`: Indicates if the `--http` option is enabled.
 * - `--port`: The port number specified via `--port`
 * - `--host`: The host name specified via `--host`
 * - `--allowed-origins`: List of allowed origins derived from the `--allowed-origins` parameter, split by commas, or undefined if not provided.
 * - `--allowed-hosts`: List of allowed hosts derived from the `--allowed-hosts` parameter, split by commas, or undefined if not provided.
 * - `--plugin-isolation <none|strict>`: Isolation preset for external tools-as-plugins.
 * - `--tool <tool-spec>`: Either a repeatable single tool-as-plugin specification or a comma-separated list of tool-as-plugin specifications. Each tool-as-plugin
 *     specification is a local module name or path.
 *
 * @note Review removing `programmatic` mode from this function path.
 *
 * @note Experimental Flags:
 * The parser strips experimental prefixes from options to allow an internal match
 * against standard option names. Actual validation and warning issuance for experimental
 * features are handled in `setOptions` to ensure both CLI and programmatic options
 * align.
 *
 * @param argv - User-defined CLI configuration options (overrides).
 * @param experimentalOptions - The available experimental options set used for filtering
 * @param [settings] - Function settings
 * @param [settings.experimentalPrefix] - String prefix for experimental flags filtering.
 * @returns An object with parsed command-line options and used experimental options.
 */
const parseCliOptions = (
  argv: string[],
  experimentalOptions: Set<string> = new Set(),
  { experimentalPrefix = 'experimental' }: { experimentalPrefix?: string } = {}
): ParsedOptions<CliOptions> => {
  const result: CliOptions = {
    modeOptions: { ...DEFAULT_OPTIONS.modeOptions },
    logging: { ...DEFAULT_OPTIONS.logging },
    isHttp: false,
    toolModules: [],
    pluginIsolation: undefined
  };

  // Aggregate tokens and values
  const updatedExperimentalPrefix = `--${experimentalPrefix}-`;
  const usedExperimentalOptions = new Set<string>();
  const tokensMap = new Map<string, { value?: string }[]>();
  let lastToken: string | undefined = undefined;
  let lastTokenName: string | undefined = undefined;
  let lastCleanedToken: string | undefined = undefined;

  for (const token of argv) {
    if (token.startsWith('-')) {
      const isExperimentalPrefix = token.startsWith(updatedExperimentalPrefix);
      const flagPart = isExperimentalPrefix
        ? token.slice(updatedExperimentalPrefix.length)
        : token.startsWith('--') ? token.slice(2) : token.slice(1);

      const internalName = kebabToCamel(flagPart);
      const isRegisteredExperimental = experimentalOptions?.has(internalName);
      const isExperimental = isExperimentalPrefix && isRegisteredExperimental;

      if (isRegisteredExperimental && !isExperimentalPrefix) {
        lastToken = undefined;
        lastTokenName = undefined;
        lastCleanedToken = undefined;
        continue;
      }

      if (isExperimentalPrefix && !isRegisteredExperimental) {
        lastToken = undefined;
        lastTokenName = undefined;
        lastCleanedToken = undefined;
        continue;
      }

      lastToken = token;
      lastTokenName = internalName;
      lastCleanedToken = `--${flagPart}`;

      if (isExperimental) {
        usedExperimentalOptions.add(lastTokenName);
      }

      if (lastCleanedToken === '--http') {
        result.isHttp = true;
      }

      if (!tokensMap.has(lastCleanedToken)) {
        tokensMap.set(lastCleanedToken, []);
      }
    } else if (lastToken && lastTokenName && lastCleanedToken) {
      tokensMap.get(lastCleanedToken)?.push({ value: token });
    }
  }

  // Tracking for toolModules to avoid duplicates
  const seenTools = new Set<string>();
  let isVerbose = false;

  const processFlags = (cleanedToken: string, value?: string) => {
    switch (cleanedToken) {
      case '--mode':
        if (value && MODE_LEVELS.includes(value.toLowerCase() as DefaultOptions['mode'])) {
          result.mode = value.toLowerCase() as DefaultOptions['mode'];
        }
        break;

      case '--mode-test-url':
        if (value && isUrl(value) && result.modeOptions) {
          result.modeOptions.test = { ...result.modeOptions.test, baseUrl: value.trim() };
        }
        break;

      case '--log-level':
        if (value && logSeverity(value.toLowerCase() as LogLevel) > -1) {
          result.logging.level = value.toLowerCase() as LoggingOptions['level'];
        }
        break;

      case '--verbose':
        isVerbose = true;
        break;

      case '--log-stderr':
        result.logging.stderr = true;
        break;

      case '--log-protocol':
        result.logging.protocol = true;
        break;

      case '--port':
        if (result.isHttp && value) {
          const port = portValid(value);

          if (port !== undefined) {
            result.http ??= {};
            result.http.port = port;
          }
        }
        break;

      case '--host':
        if (result.isHttp && value) {
          result.http ??= {};
          result.http.host = value;
        }
        break;

      case '--allowed-origins':
      case '--allowed-hosts': {
        if (result.isHttp && value) {
          const list = value.split(',').map(str => str.trim()).filter(Boolean);

          result.http ??= {};

          if (cleanedToken === '--allowed-origins') {
            result.http.allowedOrigins = list;
          } else {
            result.http.allowedHosts = list;
          }
        }
        break;
      }

      case '--tool':
        if (value) {
          value.split(',').forEach(spec => {
            const trimmed = spec.trim();

            if (trimmed && !seenTools.has(trimmed)) {
              seenTools.add(trimmed);
              result.toolModules.push(trimmed);
            }
          });
        }
        break;

      case '--plugin-isolation':
        if (value) {
          const val = value.toLowerCase();
          const match = PLUGIN_ISOLATION.find(isolation => isolation === val);

          if (match) {
            result.pluginIsolation = match;
          }
        }
        break;
    }
  };

  tokensMap.forEach((list, cleanedToken) => {
    if (!list.length) {
      processFlags(cleanedToken);

      return;
    }

    list.forEach(({ value }) => {
      processFlags(cleanedToken, value);
    });
  });

  // Cleanup: ensure logging matches severity after verbose/level processing
  if (isVerbose) {
    result.logging.level = 'debug';
  }

  return {
    options: result,
    experimentalOptions: [...usedExperimentalOptions]
  };
};

/**
 * Reductive/subtractive parse for programmatic configuration options.
 * - Focuses on removing keys from options.
 * - Separates out supported `experimental` options from standard options.
 * - `experimental` checks only handle top-level properties.
 * - Declaring multiple options with the same `experimental` prefix means the last one wins.
 *
 * @note Experimental Options:
 * The parser strips experimental prefixes from options to allow an internal match
 * against standard option names. Actual validation and warning issuance for experimental
 * features are handled in `setOptions` to ensure both CLI and programmatic options
 * align.
 *
 * @param options - User-defined configuration options (overrides).
 * @param experimentalOptions - The available experimental options set used for filtering
 * @param [settings] - Function settings
 * @param [settings.experimentalPrefix] - String prefix for experimental flags filtering.
 * @returns An object with options and used experimental options.
 */
const parseProgrammaticOptions = (
  options: ProgrammaticOptions,
  experimentalOptions:Set<string> = new Set(),
  { experimentalPrefix = 'experimental' }: { experimentalPrefix?: string } = {}
): ParsedOptions<ProgrammaticOptions> => {
  const updatedOptions: ProgrammaticOptions = { ...options };
  const usedExperimental = new Map<string, unknown>();

  // Sanitize sans-experimental experimental options
  experimentalOptions.forEach(value => {
    delete (updatedOptions as Record<string, unknown>)[value];
  });

  // Aggregate and remove experimental options
  for (const key in options) {
    if (key?.startsWith(experimentalPrefix) && key.length > experimentalPrefix.length) {
      const internalKey = key
        .slice(experimentalPrefix.length).charAt(0).toLowerCase() +
        key.slice(experimentalPrefix.length + 1);

      if (experimentalOptions.has(internalKey)) {
        usedExperimental.set(internalKey, options[key as keyof ProgrammaticOptions]);
        delete (updatedOptions as Record<string, unknown>)[key];
      }
    }
  }

  // Apply experimental values, if any
  usedExperimental.forEach((value, key) => {
    (updatedOptions as Record<string, unknown>)[key] = value;
  });

  return {
    options: updatedOptions,
    experimentalOptions: [...usedExperimental.keys()]
  };
};

export {
  parseCliOptions,
  parseProgrammaticOptions,
  type AppSession,
  type CliOptions,
  type DefaultOptions,
  type GlobalOptions,
  type HttpOptions,
  type LoggingOptions,
  type MakeExperimental,
  type ProgrammaticOptions
};

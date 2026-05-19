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
import { kebabToCamel } from './options.helpers';
import { type LogLevel, logSeverity } from './logger';
import { isUrl, portValid } from './server.helpers';

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

const EXPERIMENTAL_PREFIX = 'experimental';

/**
 * Programmatic keys use `experimental` + PascalCase (e.g. `experimentalPluginIsolation`).
 */
const isProgrammaticExperimentalKey = (key: string): boolean =>
  key.startsWith(EXPERIMENTAL_PREFIX) &&
  key.length > EXPERIMENTAL_PREFIX.length &&
  key.charAt(EXPERIMENTAL_PREFIX.length) >= 'A' &&
  key.charAt(EXPERIMENTAL_PREFIX.length) <= 'Z';

/**
 * Map `experimentalPluginIsolation` → `pluginIsolation`.
 */
const toInternalExperimentalKey = (programmaticKey: string): string => {
  const suffix = programmaticKey.slice(EXPERIMENTAL_PREFIX.length);

  return suffix.charAt(0).toLowerCase() + suffix.slice(1);
};

/**
 * Skip argv tokens that name a registered experimental option unless rewritten from `--experimental-`.
 */
const isRegisteredExperimentalCliToken = (token: string, registry: Set<string>): boolean => {
  if (!registry.size) {
    return false;
  }

  const bare = token.startsWith('--') ? token.slice(2) : token;

  return registry.has(bare) || registry.has(kebabToCamel(bare));
};

/**
 * Parse CLI configuration options.
 * - **IMPORTANT**: Exposed CLI options should be kebab-case, lowerCamel is reserved for
 *     internal distinction.
 * - Parses `process.argv` options
 * - Separates out supported experimental options from standard ones.
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
 * The parser strips `--experimental-` prefixes from options to allow an internal match
 * against standard flag names. Registered experimental options cannot be set via their
 * direct CLI flag (including camelCase tokens); use `--experimental-<kebab-name>` only.
 * Validation and warning issuance are handled downstream in `setOptions`.
 *
 * @note HTTP-related flags (`--port`, `--host`, `--allowed-origins`, `--allowed-hosts`) are
 * only applied when `--http` is present.
 *
 * @param argv - User-defined CLI configuration options (overrides).
 * @param experimentalOptions - The available experimental options set used for filtering
 * @returns An object with parsed command-line options and used experimental options.
 */
const parseCliOptions = (
  argv: string[], experimentalOptions: Set<string> = new Set()
): ParsedOptions<CliOptions> => {
  const registry = experimentalOptions ?? new Set<string>();
  const result: CliOptions = {
    modeOptions: { ...DEFAULT_OPTIONS.modeOptions },
    logging: { ...DEFAULT_OPTIONS.logging },
    isHttp: argv.includes('--http'),
    toolModules: [],
    pluginIsolation: undefined
  };
  const usedExperimentalOptions = new Set<string>();

  const applyHttp = (apply: (http: Partial<HttpOptions>) => void): void => {
    if (!result.isHttp) {
      return;
    }

    result.http ??= {};
    apply(result.http);
  };

  // Tracking for toolModules to avoid duplicates
  const seenTools = new Set<string>();
  let isVerbose = false;

  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];

    // Filter falsy tokens and direct uses of registered experimental option names
    if (!token || isRegisteredExperimentalCliToken(token, registry)) {
      continue;
    }

    if (token.startsWith('--experimental-')) {
      const flagName = token.slice('--experimental-'.length);
      const internalFlagName = kebabToCamel(flagName);

      if (registry.has(internalFlagName)) {
        token = `--${flagName}`;
        usedExperimentalOptions.add(internalFlagName);
      } else {
        continue;
      }
    }

    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('-');

    // 2. Process Flags
    switch (token) {
      case '--mode':
        if (hasValue && MODE_LEVELS.includes(next.toLowerCase() as DefaultOptions['mode'])) {
          result.mode = next.toLowerCase() as DefaultOptions['mode'];
          i += 1;
        }
        break;

      case '--mode-test-url':
        if (hasValue && isUrl(next) && result.modeOptions) {
          result.modeOptions.test = { ...result.modeOptions.test, baseUrl: next.trim() };
          i += 1;
        }
        break;

      case '--log-level':
        if (hasValue && logSeverity(next.toLowerCase() as LogLevel) > -1) {
          result.logging.level = next.toLowerCase() as LoggingOptions['level'];
          i += 1;
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
        if (hasValue) {
          const port = portValid(next);

          if (port !== undefined) {
            applyHttp(http => {
              http.port = port;
            });
          }
          i += 1;
        }
        break;

      case '--host':
        if (hasValue) {
          applyHttp(http => {
            http.host = next;
          });
          i += 1;
        }
        break;

      case '--allowed-origins':
      case '--allowed-hosts': {
        if (hasValue) {
          const list = next.split(',').map(str => str.trim()).filter(Boolean);

          applyHttp(http => {
            if (token === '--allowed-origins') {
              http.allowedOrigins = list;
            } else {
              http.allowedHosts = list;
            }
          });
          i += 1;
        }
        break;
      }

      case '--tool':
        if (hasValue) {
          next.split(',').forEach(spec => {
            const trimmed = spec.trim();

            if (trimmed && !seenTools.has(trimmed)) {
              seenTools.add(trimmed);
              result.toolModules.push(trimmed);
            }
          });
          i += 1;
        }
        break;

      case '--plugin-isolation':
        if (hasValue) {
          const val = next.toLowerCase();
          const match = PLUGIN_ISOLATION.find(value => value === val);

          if (match) {
            result.pluginIsolation = match;
          }
          i += 1;
        }
        break;
    }
  }

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
 * Parse programmatic configuration options.
 * - Separates out supported experimental options from standard ones.
 * - Only keys matching `experimental` + PascalCase are treated as experimental aliases
 *     (the `experimental` metadata array is passed through unchanged).
 *
 * @param options - User-defined configuration options (overrides).
 * @param experimentalOptions - The available experimental options set used for filtering
 * @returns An object with options and used experimental options.
 */
const parseProgrammaticOptions = (
  options: ProgrammaticOptions, experimentalOptions: Set<string> = new Set()
): ParsedOptions<ProgrammaticOptions> => {
  const registry = experimentalOptions ?? new Set<string>();
  const usedExperimental = new Set<string>();
  const updatedOptions: ProgrammaticOptions = {};
  const entries = Object.entries(options) as [string, unknown][];

  for (const [key, value] of entries) {
    if (!isProgrammaticExperimentalKey(key)) {
      (updatedOptions as Record<string, unknown>)[key] = value;
    }
  }

  for (const [key, value] of entries) {
    if (!isProgrammaticExperimentalKey(key)) {
      continue;
    }

    const internalKey = toInternalExperimentalKey(key);

    if (registry.has(internalKey)) {
      (updatedOptions as Record<string, unknown>)[internalKey] = value;
      usedExperimental.add(internalKey);
    }
  }

  return {
    options: updatedOptions,
    experimentalOptions: [...usedExperimental]
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

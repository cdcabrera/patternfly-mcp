import {
  DEFAULT_OPTIONS,
  CONTEXT_MANAGEMENT,
  MODE_LEVELS,
  PLUGIN_ISOLATION,
  type DefaultOptions,
  type DefaultOptionsOverrides,
  type LoggingOptions,
  type HttpOptions,
  type MakeExperimental,
  type ModeOptions
} from './options.defaults';
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
 * Options parsed from CLI arguments
 *
 * @note `pluginIsolation` preset for external plugins (CLI-provided). If omitted, defaults
 * to 'strict' when external tools are requested, otherwise 'none'.
 */
type CliOptions = {
  mode?: DefaultOptions['mode'];
  modeOptions?: Partial<ModeOptions>;
  contextManagement: DefaultOptions['contextManagement'] | undefined;
  http?: Partial<HttpOptions>;
  isHttp: boolean;
  logging: Partial<LoggingOptions>;
  toolModules: string[];
  pluginIsolation: 'none' | 'strict' | undefined;
};

type ParsedOptions<T> = {
  options: T;
  experimentalOptions: string[];
};

/**
 * Get argument value from argv (defaults to `process.argv`).
 *
 * @param flag - CLI flag to search for
 * @param [options] - Options
 * @param [options.defaultValue] - Default arg value
 * @param [options.argv] - Command-line arguments to parse. Defaults to `process.argv`.
 */
const getArgValue = (flag: string, { defaultValue, argv = process.argv }: { defaultValue?: unknown, argv?: string[] } = {}) => {
  const index = argv.indexOf(flag);

  if (index === -1) {
    return defaultValue;
  }

  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    return defaultValue;
  }

  if (typeof defaultValue === 'number') {
    const num = parseInt(value, 10);

    if (isNaN(num)) {
      return defaultValue;
    }

    return num;
  }

  return value;
};

/**
 * Parses CLI options and return config options for the application.
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
 * - `--context`
 *
 * @note Review removing `programmatic` mode from this function path.
 *
 * @note Experimental Flags:
 * The parser strips `--experimental-` prefixes from options to allow an internal match
 * against standard flag names. Actual validation and warning issuance for experimental
 * features are handled downstream in `setOptions` via `normalizeExperimentalOptions`
 * to ensure both CLI and programmatic options align.
 *
 * @param [argv] - Command-line arguments to parse. Defaults to `process.argv`.
 * @returns Parsed command-line options.
 */
const parseCliOptions = ({ argv, experimentalOptions }: { argv: string[]; experimentalOptions: Set<string> }): ParsedOptions<CliOptions> => {
  const result: CliOptions = {
    modeOptions: { ...DEFAULT_OPTIONS.modeOptions },
    logging: { ...DEFAULT_OPTIONS.logging },
    isHttp: argv.includes('--http'),
    http: {},
    toolModules: [],
    pluginIsolation: undefined,
    contextManagement: DEFAULT_OPTIONS.contextManagement
  };
  const usedExperimentalOptions: string[] = [];

  // Tracking for toolModules to avoid duplicates
  const seenTools = new Set<string>();
  let isVerbose = false;

  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];

    if (!token || experimentalOptions.has(token)) {
      continue;
    }

    const isExperimental = token.startsWith('--experimental-');

    if (isExperimental) {
      const flagName = token.replace('--experimental-', '');

      if (experimentalOptions.has(flagName)) {
        token = `--${flagName}`;
        usedExperimentalOptions.push(flagName);
      } else {
        continue;
      }
    }

    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('-');

    // 2. Process Flags
    switch (token) {
      case '--mode':
        if (hasValue && MODE_LEVELS.includes(next.toLowerCase() as any)) {
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
            result.http!.port = port;
          }
          i += 1;
        }
        break;

      case '--host':
        if (hasValue) {
          result.http!.host = next;
          i += 1;
        }
        break;

      case '--allowed-origins':
      case '--allowed-hosts': {
        if (hasValue) {
          const list = next.split(',').map(str => str.trim()).filter(Boolean);

          if (token === '--allowed-origins') {
            result.http!.allowedOrigins = list;
          } else {
            result.http!.allowedHosts = list;
          }
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

      case '--context-management':
        if (hasValue) {
          const strategy = next.toLowerCase();
          const match = CONTEXT_MANAGEMENT.find(value => value === strategy);

          if (match) {
            result.contextManagement = match;
          }
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
    experimentalOptions: usedExperimentalOptions
  };
};

const parseProgrammaticOptions = (
  { options, experimentalOptions }: { options: DefaultOptionsOverrides; experimentalOptions: Set<string> }
): ParsedOptions<DefaultOptionsOverrides> => {
  const updatedOptions: DefaultOptionsOverrides = {};
  const usedExperimental: string[] = [];
  // const optionsEntries = Object.entries(options);

  // const updatedOptions = {};

  /*
  for (let i = 0; i < options.length; i++) {
    let token = argv[i];

    if (!token || experimentalOptions.has(token)) {
      continue;
    }

    const isExperimental = token.startsWith('--experimental-');

    if (isExperimental) {
      const flagName = token.replace('--experimental-', '');

      if (experimentalOptions.has(flagName)) {
        token = `--${flagName}`;
      } else {
        continue;
      }
    }
  }
   */

  return {
    options: updatedOptions,
    experimentalOptions: usedExperimental
  };
};

export {
  parseCliOptions,
  parseProgrammaticOptions,
  getArgValue,
  type AppSession,
  type CliOptions,
  type DefaultOptions,
  type DefaultOptionsOverrides,
  type GlobalOptions,
  type HttpOptions,
  type LoggingOptions,
  type MakeExperimental
};

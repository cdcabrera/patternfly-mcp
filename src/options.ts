import {
  DEFAULT_OPTIONS,
  MODE_LEVELS,
  PLUGIN_ISOLATION,
  type DefaultOptions,
  type LoggingOptions,
  type HttpOptions,
  type ModeOptions
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
 * Keys on {@link ProgrammaticOptions} that may be enabled via experimental surfaces.
 */
type ExperimentalOptionKey = keyof ProgrammaticOptions;

/**
 * Options parsed from CLI arguments. Exposed to the consumer/user.
 *
 * @note Option behaviors:
 * - `pluginIsolation` preset for external plugins (CLI-provided). If omitted, defaults
 *     to 'strict' when external tools are requested, otherwise 'none'.
 * - `toolModules` is limited to a list of file entries
 */
type CliOptions = MakeExperimental<(Omit<ProgrammaticOptions, 'toolModules'> & {
  toolModules: string[]
}), ExperimentalOptions>;

/**
 * Option overrides parsed for programmatic use. Exposed to the consumer/user.
 *
 * @see {@link DefaultOptions}
 */
type ProgrammaticOptions = MakeExperimental<{
  mode?: DefaultOptions['mode'] | undefined;
  modeOptions?: Partial<ModeOptions> | undefined;
  http?: Partial<HttpOptions> | undefined;
  isHttp?: boolean | undefined;
  logging?: Partial<LoggingOptions> | undefined;
  pluginIsolation?: DefaultOptions['pluginIsolation'] | undefined;
  toolModules?: DefaultOptions['toolModules'] | undefined;
  docsPaths?: DefaultOptions['docsPaths'] | undefined;
  name?: string | undefined;
  version?: string | undefined;
}, ExperimentalOptions>;

/**
 * Available experimental options.
 */
type ExperimentalOptions = never;

/**
 * Options currently in experimental status for consumers.
 *
 * @note Add experimental options for consumer use.
 * 1. Add a key to the `options.defaults` sans-experimental prefix, declare your type.
 * 2. Then add the internal key name
 *    - to `type ProgrammaticOptions`; ONLY IF the CLI receives a lesser variation of the option, update `type CliOptions`
 *    - to `PROGRAMMATIC_OPTIONS` (e.g., `const PROGRAMMATIC_OPTIONS = ['loremIpsum`...])
 *    - to `type ExperimentalOptions` (e.g., `type ExperimentalOptions = 'loremIpsum' | 'dolorSit`)
 *    - to `EXPERIMENTAL_OPTIONS` (e.g., `new Set<ExperimentalOptionKey>(['loremIpsum'])`)
 * 3. Update the `parseCliOptions` switch with the new flag. A unit test update is optional since it is experimental.
 * 4. Finally, the option should be exposed as
 *    - `cli` as `--experimental-[the option]`
 *    - `programmatic` as `experimental[TheOption]`
 */
const EXPERIMENTAL_OPTIONS = new Set<ExperimentalOptions>([]);

/**
 * List of configurable options that can be used programmatically.
 */
const PROGRAMMATIC_OPTIONS = [
  ...EXPERIMENTAL_OPTIONS,
  'mode',
  'modeOptions',
  'http',
  'isHttp',
  'logging',
  'pluginIsolation',
  'toolModules',
  'docsPaths',
  'name',
  'version'
] as const;

/**
 * Additive parse for CLI configuration options.
 * > **IMPORTANT**: Exposed CLI options should be kebab-case, lowerCamel is reserved for internal distinction.
 *
 * - Focuses on adding options into configuration.
 * - Parses `process.argv` options
 * - HTTP sub-flags (e.g. `--port`, `--host`, etc.) apply only when `--http` is set.
 * - Experimental options
 *   - Separates out supported `--experimental-` options from standard options.
 *   - Registered experimental options use `--experimental-<kebab-name>`.
 *   - Any use of registered experimental options without experimental is ignored.
 * - Repeat values for the same flag:
 *   - Single-value flags (e.g., `--mode`, `--port`): last value wins.
 *   - Cumulative flags (e.g., `--tool`): values are aggregated into a list.
 * - `--verbose` wins over `--log-level` regardless of argv order.
 * - Skipped flags (unregistered or direct experimental): the following argv value is orphaned
 *   (discarded; it does not attach to the previous flag).
 * - Single-dash flags (e.g. `-h`): not supported today; any token starting with the `-` is treated as
 *   a flag, but only `--long-form-option` names are normalized and handled. If/when we accept short
 *   flags, parsing will need to be adjusted. Or we could also review adding in a package to handle args.
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
 * - `--experimental-<option>`: Registered option in experimental status.
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
 * @param [settings] - Function settings
 * @param [settings.experimentalOptions] - The available experimental options set used for filtering
 * @param [settings.experimentalPrefix] - String prefix for experimental flags filtering.
 * @returns An object with parsed command-line options and used experimental options.
 */
const parseCliOptions = (
  argv: string[],
  {
    experimentalOptions = EXPERIMENTAL_OPTIONS,
    experimentalPrefix = 'experimental'
  }: { experimentalOptions?: Set<ExperimentalOptionKey>, experimentalPrefix?: string } = {}
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
      const isRegisteredExperimental = experimentalOptions.has(internalName as ExperimentalOptionKey);
      const isExperimental = isExperimentalPrefix && isRegisteredExperimental;
      const isExperimentalSkipped = (isRegisteredExperimental && !isExperimentalPrefix) ||
        (isExperimentalPrefix && !isRegisteredExperimental);

      if (isExperimentalSkipped) {
        // Orphan the next argv value: it is not paired with this flag or the previous one.
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
          result.logging ??= {};
          result.logging.level = value.toLowerCase() as LoggingOptions['level'];
        }
        break;

      case '--verbose':
        isVerbose = true;
        break;

      case '--log-stderr':
        result.logging ??= {};
        result.logging.stderr = true;
        break;

      case '--log-protocol':
        result.logging ??= {};
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

  // --verbose wins over --log-level regardless of argv order
  if (isVerbose) {
    result.logging ??= {};
    result.logging.level = 'debug';
  }

  return {
    options: result,
    experimentalOptions: [...usedExperimentalOptions]
  };
};

/**
 * Filter programmatic options to keys that exist in base options.
 *
 * @param {ProgrammaticOptions} source - Complete set of programmatic options provided as input.
 * @returns {ProgrammaticOptions} New object containing only the filtered programmatic options found in base options.
 */
const pickProgrammaticOptions = (source: ProgrammaticOptions): ProgrammaticOptions => {
  const picked: Record<string, unknown> = {};

  for (const key of Object.keys(source)) {
    if (PROGRAMMATIC_OPTIONS.includes(key as keyof ProgrammaticOptions)) {
      picked[key] = source[key as keyof ProgrammaticOptions];
    }
  }

  return picked as ProgrammaticOptions;
};

/**
 * Reductive/subtractive parse for programmatic configuration options.
 * - Focuses on removing keys from options.
 * - Experimental options
 *   - Separates out supported `experimental` options from standard options.
 *   - Strips every `${experimentalPrefix}*` key
 *   - `experimental` checks only handle top-level properties.
 *   - Declaring multiple options with the same `experimental` prefix means the last one wins.
 *
 * @note Experimental Options:
 * The parser strips experimental prefixes from options to allow an internal match
 * against standard option names. Actual validation and warning issuance for experimental
 * features are handled in `setOptions` to ensure both CLI and programmatic options
 * align.
 *
 * @param options - User-defined configuration options (overrides).
 * @param [settings] - Function settings
 * @param [settings.experimentalOptions] - The available experimental options set used for filtering
 * @param [settings.experimentalPrefix] - String prefix for experimental flags filtering.
 * @returns An object with options and used experimental options.
 */
const parseProgrammaticOptions = (
  options: ProgrammaticOptions,
  {
    experimentalOptions = EXPERIMENTAL_OPTIONS,
    experimentalPrefix = 'experimental'
  }: { experimentalOptions?: Set<ExperimentalOptionKey>, experimentalPrefix?: string } = {}
): ParsedOptions<ProgrammaticOptions> => {
  const updatedOptions: ProgrammaticOptions = { ...options };
  const usedExperimental = new Map<ExperimentalOptionKey, unknown>();

  // Sanitize sans-experimental experimental options
  experimentalOptions.forEach(key => {
    delete updatedOptions[key];
  });

  // Aggregate and remove experimental options, own keys only
  for (const key of Object.keys(options)) {
    if (key.startsWith(experimentalPrefix) && key.length > experimentalPrefix.length) {
      const internalKey = (
        key.slice(experimentalPrefix.length).charAt(0).toLowerCase() +
        key.slice(experimentalPrefix.length + 1)
      ) as ExperimentalOptionKey;

      if (experimentalOptions.has(internalKey)) {
        usedExperimental.set(internalKey, options[key as keyof ProgrammaticOptions]);
      }

      delete (updatedOptions as Record<string, unknown>)[key];
    }
  }

  // Apply experimental values, if any
  usedExperimental.forEach((value, key) => {
    (updatedOptions as Record<string, unknown>)[key] = value;
  });

  return {
    options: pickProgrammaticOptions(updatedOptions),
    experimentalOptions: [...usedExperimental.keys()]
  };
};

export {
  EXPERIMENTAL_OPTIONS,
  parseCliOptions,
  parseProgrammaticOptions,
  type AppSession,
  type CliOptions,
  type DefaultOptions,
  type ExperimentalOptions,
  type ExperimentalOptionKey,
  type GlobalOptions,
  type HttpOptions,
  type LoggingOptions,
  type MakeExperimental,
  type ParsedOptions,
  type ProgrammaticOptions
};

import {
  type DefaultOptions,
  type LoggingOptions,
  type HttpOptions,
  type ModeOptions
} from './options.defaults';

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
type MakeExperimental<T, K extends string = never> = T & {
  [P in Extract<K, keyof T> as `experimental${Capitalize<P & string>}`]?: T[P]
};

/**
 * Keys on {@link ProgrammaticOptions} that may be enabled via experimental surfaces.
 */
type ExperimentalOptionKey = keyof ProgrammaticOptionsBase;

/**
 * Options parsed from CLI arguments. Exposed to the consumer/user.
 *
 * @note Option behaviors:
 * - `pluginIsolation` preset for external plugins (CLI-provided). If omitted, defaults
 *     to 'strict' when external tools are requested, otherwise 'none'.
 * - `toolModules` is limited to a list of file entries
 *
 * @see {@link EXPERIMENTAL_REGISTRY} for directions on adding experimental flags.
 */
type CliOptions = MakeExperimental<CliOptionsBase, ExperimentalOptions>;

/**
 * Core option definitions for CLI use.
 */
type CliOptionsBase = Omit<ProgrammaticOptionsBase, 'docsPaths' | 'name' | 'toolModules' | 'version'> & {
  toolModules: string[]
};

/**
 * Option overrides parsed for programmatic use. Exposed to the consumer/user.
 *
 * @see {@link EXPERIMENTAL_REGISTRY} for directions on adding experimental flags.
 */
type ProgrammaticOptions = MakeExperimental<ProgrammaticOptionsBase, ExperimentalOptions>;

/**
 * Core option definitions for programmatic use.
 */
type ProgrammaticOptionsBase = {
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
};

/**
 * Registry for internal experimental features.
 *
 * To expose experimental options for consumer use:
 *   1. Add a key to the `options.defaults` sans-experimental prefix (internal key name), declare your type.
 *   2. Then add the internal key name
 *      - to `type ProgrammaticOptionsBase`; ONLY IF the CLI receives a lesser variation of the option, update `type CliOptions`
 *      - to `EXPERIMENTAL_REGISTRY` (e.g., `{ someFeature: { cli: true } }`)
 *   3. If the option is available for CLI, update the `parseCliOptions` switch with the new flag. A unit test update is optional since it is experimental.
 *   4. Finally, the option would be exposed as
 *      - `cli` as `--experimental-[the option]` (if available)
 *      - `programmatic` as `experimental[TheOption]`
 *
 * @example Add a new experimental internal key
 * const EXPERIMENTAL_REGISTRY = {
 *   someFeature: { cli: true }
 * } ...
 */
const EXPERIMENTAL_REGISTRY = {
  // Add new experimental keys here.
} as const satisfies Partial<Record<ExperimentalOptionKey, { cli: boolean }>>;

/**
 * Available experimental options.
 * - Apply `never` if there are no experimental options.
 *
 * @see {@link EXPERIMENTAL_REGISTRY} for directions on adding experimental flags.
 */
type ExperimentalOptions = keyof typeof EXPERIMENTAL_REGISTRY;

/**
 * Options currently in experimental status for consumers.
 *
 * @generated See {@link EXPERIMENTAL_REGISTRY} for source.
 */
const EXPERIMENTAL_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.keys(EXPERIMENTAL_REGISTRY) as ExperimentalOptionKey[]
);

/**
 * Available experimental CLI options.
 *
 * @generated See {@link EXPERIMENTAL_REGISTRY} for source.
 */
const EXPERIMENTAL_CLI_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(EXPERIMENTAL_REGISTRY)
    .filter(([_, config]) => (config as { cli: boolean }).cli)
    .map(([key]) => key as ExperimentalOptionKey)
);

/**
 * List of configurable options that can be used programmatically.
 *
 * @see {@link EXPERIMENTAL_REGISTRY} for directions on adding experimental flags.
 */
const PROGRAMMATIC_OPTIONS = [
  'mode',
  'modeOptions',
  'http',
  'isHttp',
  'logging',
  'pluginIsolation',
  'toolModules',
  'docsPaths',
  'name',
  'version',
  ...EXPERIMENTAL_OPTIONS
] as const;

export {
  EXPERIMENTAL_CLI_OPTIONS,
  EXPERIMENTAL_OPTIONS,
  PROGRAMMATIC_OPTIONS,
  type AppSession,
  type CliOptions,
  type DefaultOptions,
  type ExperimentalOptions,
  type ExperimentalOptionKey,
  type GlobalOptions,
  type HttpOptions,
  type LoggingOptions,
  type MakeExperimental,
  type ProgrammaticOptions
};

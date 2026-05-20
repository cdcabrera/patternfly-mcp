import {
  type DefaultOptions,
  type LoggingOptions,
  type HttpOptions,
  type ModeOptions
} from './options.defaults';

/**
 * Global options, convenience type for `DefaultOptions`
 */
type GlobalOptions = DefaultOptions;

/**
 * Session defaults, not user-configurable
 */
type AppSession = {
  readonly sessionId: string;
  readonly publicSessionId: string;
  readonly channelName: string;
};

/**
 * Metadata for an option.
 * The `_type` property is a phantom property used only for TypeScript inference.
 */
interface OptionMeta<T, C extends boolean = boolean, E extends boolean = boolean> {
  readonly cli: C;
  readonly experimental?: E;
  readonly _type?: T;
}

/**
 * Helper to define an option with full type inference.
 *
 * @template T - The type of the value associated with the option.
 * @template C - A boolean indicating whether the option is CLI-specific.
 * @template E - An optional boolean indicating whether the option is experimental. Defaults to `false`.
 *
 * @param {Object} meta - The metadata object defining the option.
 * @param {C} meta.cli - Specifies if the option is CLI-specific.
 * @param {E} [meta.experimental] - Specifies if the option is experimental.
 *
 * @returns {OptionMeta<T, C, E>} The provided metadata object cast as `OptionMeta<T, C, E>`.
 */
const defineOption = <T, const C extends boolean, const E extends boolean = false>(
  meta: { cli: C; experimental?: E }
): OptionMeta<T, C, E> => ({
  ...meta,
  experimental: (meta.experimental ?? false) as E,
  _type: undefined as T
} as OptionMeta<T, C, E>);

const OPTIONS_REGISTRY = {
  mode: defineOption<DefaultOptions['mode']>({ cli: true }),
  modeOptions: defineOption<Partial<ModeOptions>>({ cli: true }),
  http: defineOption<Partial<HttpOptions>>({ cli: true }),
  isHttp: defineOption<boolean>({ cli: true }),
  logging: defineOption<Partial<LoggingOptions>>({ cli: true }),
  pluginIsolation: defineOption<DefaultOptions['pluginIsolation']>({ cli: true }),
  toolModules: defineOption<DefaultOptions['toolModules']>({ cli: true }),
  docsPaths: defineOption<DefaultOptions['docsPaths']>({ cli: false }),
  name: defineOption<string>({ cli: false }),
  version: defineOption<string>({ cli: false })
} as const;

/**
 * See {@link OPTIONS_REGISTRY}
 */
type OptionsRegistry = typeof OPTIONS_REGISTRY;

/**
 * See {@link OPTIONS_REGISTRY}
 */
type ProgrammaticOptionsBase = {
  [K in keyof OptionsRegistry]?: OptionsRegistry[K]['_type'];
};

/**
 * See {@link OPTIONS_REGISTRY}
 */
type CliOptionsBase = {
  [K in keyof OptionsRegistry as OptionsRegistry[K]['cli'] extends true ? K : never]:
  K extends 'toolModules' ? string[] : OptionsRegistry[K]['_type']
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
type MakeExperimental<T, K extends string = never> = T & {
  [P in Extract<K, keyof T> as `experimental${Capitalize<P & string>}`]?: T[P]
};

/**
 * See {@link OPTIONS_REGISTRY}
 */
type ExperimentalOptions = keyof {
  [K in keyof OptionsRegistry as OptionsRegistry[K]['experimental'] extends true ? K : never]: unknown
} & string;

/**
 * Consumer facing CLI options.
 */
type CliOptions = MakeExperimental<CliOptionsBase, ExperimentalOptions>;

/**
 * Consumer facing programmatic options.
 */
type ProgrammaticOptions = MakeExperimental<ProgrammaticOptionsBase, ExperimentalOptions>;

/**
 * See {@link OPTIONS_REGISTRY}
 */
type ExperimentalOptionKey = keyof OptionsRegistry & string;

/**
 * Experimental options list.
 *
 * @generated See {@link OPTIONS_REGISTRY}
 */
const EXPERIMENTAL_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(OPTIONS_REGISTRY)
    .filter(([_, meta]) => meta.experimental)
    .map(([key]) => key as ExperimentalOptionKey)
);

/**
 * Experimental options list for CLI.
 *
 * @generated See {@link OPTIONS_REGISTRY}
 */
const EXPERIMENTAL_CLI_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(OPTIONS_REGISTRY)
    .filter(([_, meta]) => meta.experimental && meta.cli)
    .map(([key]) => key as ExperimentalOptionKey)
);

/**
 * Options list for programmatic use.
 *
 * @generated See {@link OPTIONS_REGISTRY}
 */
const PROGRAMMATIC_OPTIONS = Object.keys(OPTIONS_REGISTRY) as ReadonlyArray<keyof OptionsRegistry>;

export {
  EXPERIMENTAL_CLI_OPTIONS,
  EXPERIMENTAL_OPTIONS,
  OPTIONS_REGISTRY,
  PROGRAMMATIC_OPTIONS,
  type AppSession,
  type CliOptions,
  type CliOptionsBase,
  type DefaultOptions,
  type ExperimentalOptions,
  type ExperimentalOptionKey,
  type GlobalOptions,
  type HttpOptions,
  type LoggingOptions,
  type MakeExperimental,
  type OptionsRegistry,
  type ProgrammaticOptions,
  type ProgrammaticOptionsBase
};

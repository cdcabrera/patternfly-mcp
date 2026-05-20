import {
  type DefaultOptions,
  type LoggingOptions,
  type HttpOptions,
  type ModeOptions
} from './options.defaults';

type GlobalOptions = DefaultOptions;

type AppSession = {
  readonly sessionId: string;
  readonly publicSessionId: string;
  readonly channelName: string;
};

/**
 * Metadata for an option.
 * The `_type` property is a phantom property used only for TypeScript inference.
 */
interface OptionMeta<T> {
  readonly cli: boolean;
  readonly experimental?: boolean;
  readonly _type?: T;
}

/**
 * Helper to define an option with full type inference.
 *
 * @param meta
 * @param meta.cli
 * @param meta.experimental
 */
const defineOption = <T>(meta: { cli: boolean; experimental?: boolean }): OptionMeta<T> =>
  meta as OptionMeta<T>;

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

type OptionsRegistry = typeof OPTIONS_REGISTRY;

/**
 * @generated
 */
type ProgrammaticOptionsBase = {
  [K in keyof OptionsRegistry]?: OptionsRegistry[K]['_type'];
};

/**
 * @generated
 */
type CliOptionsBase = {
  [K in keyof OptionsRegistry as OptionsRegistry[K]['cli'] extends true ? K : never]:
  K extends 'toolModules' ? string[] : OptionsRegistry[K]['_type']
};

/**
 * @generated
 */
type MakeExperimental<T, K extends string = never> = T & {
  [P in Extract<K, keyof T> as `experimental${Capitalize<P & string>}`]?: T[P]
};

/**
 * @generated
 */
type ExperimentalOptions = keyof {
  [K in keyof OptionsRegistry as OptionsRegistry[K]['experimental'] extends true ? K : never]: unknown
} & string;

/**
 * @generated
 */
type CliOptions = MakeExperimental<CliOptionsBase, ExperimentalOptions>;

/**
 * @generated
 */
type ProgrammaticOptions = MakeExperimental<ProgrammaticOptionsBase, ExperimentalOptions>;

/**
 * @generated
 */
type ExperimentalOptionKey = keyof OptionsRegistry & string;

/**
 * @generated
 */
const EXPERIMENTAL_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(OPTIONS_REGISTRY)
    .filter(([_, meta]) => meta.experimental)
    .map(([key]) => key as ExperimentalOptionKey)
);

/**
 * @generated
 */
const EXPERIMENTAL_CLI_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(OPTIONS_REGISTRY)
    .filter(([_, meta]) => meta.experimental && meta.cli)
    .map(([key]) => key as ExperimentalOptionKey)
);

/**
 * @generated
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

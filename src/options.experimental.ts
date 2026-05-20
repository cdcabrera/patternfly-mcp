import {
  type ProgrammaticOptionsBase,
  type CliOptionsBase,
  type ExperimentalOptionKey,
  EXPERIMENTAL_REGISTRY
} from './options';

type MakeExperimental<T, K extends string = never> = T & {
  [P in Extract<K, keyof T> as `experimental${Capitalize<P & string>}`]?: T[P]
};

type ExperimentalOptions = keyof typeof EXPERIMENTAL_REGISTRY;

const EXPERIMENTAL_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.keys(EXPERIMENTAL_REGISTRY) as ExperimentalOptionKey[]
);

const EXPERIMENTAL_CLI_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(EXPERIMENTAL_REGISTRY)
    .filter(([_, config]) => (config as { cli: boolean }).cli)
    .map(([key]) => key as ExperimentalOptionKey)
);

export {

};

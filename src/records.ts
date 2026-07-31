import { type GlobalOptions, type AppSession } from './options';
import { getOptions, getSessionOptions } from './options.context';

/**
 * Neutral record shape for any data source that feeds the "resources blender".
 * A "source" can be the PatternFly API crawler, a git-repo scraper, a
 * non-PatternFly API adapter, etc.
 *
 * @property sourceId - Stable source identifier, e.g. 'patternfly-api', 'patternfly-git', 'react-aria'.
 * @property kind - Coarse content class used by the blender to pick a policy.
 * @property key - Normalized join key (lowercased component name / pathSlug).
 * @property version - Optional version tag: patternfly major, git sha/tag, semver, etc.
 * @property payload - Free-form payload; blender inspects `props`, `css`, `content`.
 * @property provenance - Source provenance metadata.
 */
interface SourceRecord {
  sourceId: string;
  kind: 'component' | 'guideline' | 'example' | 'schema' | 'prose';
  key: string;
  version?: string;
  payload: {
    props?: unknown;
    css?: unknown;
    content?: unknown;
    [k: string]: unknown;
  };
  provenance: {
    url?: string;
    commit?: string;
    fetchedAt: string; // ISO-8601
  };
}

/**
 * A source adapter is anything that can produce SourceRecord[] on demand.
 * The PatternFly API crawler is the first implementation.
 */
interface RecordsSource<Options = unknown, Ctx = unknown> {
  id: string;
  isEnabled(options: Options): boolean;
  collect(
    options: Options,
    ctx: Ctx
  ): Promise<{
    records: SourceRecord[];
    warnings: string[];
    errors: string[];
  }>;
}

/**
 * Compose built-in and external PatternFly records sources.
 *
 * @param builtinSources - Pre-registered source adapters
 * @param options - Global options
 * @param session - Session options
 */
const composePatternFly = async (
  builtinSources: RecordsSource<GlobalOptions, AppSession>[],
  options: GlobalOptions = getOptions(),
  session: AppSession = getSessionOptions()
): Promise<{ records: SourceRecord[]; warnings: string[]; errors: string[] }> => {
  const records: SourceRecord[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const source of builtinSources) {
    if (source.isEnabled(options)) {
      try {
        const result = await source.collect(options, session);

        records.push(...result.records);
        warnings.push(...result.warnings);
        errors.push(...result.errors);
      } catch (error) {
        errors.push(`Source [${source.id}] collect crashed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { records, warnings, errors };
};

export { composePatternFly, type RecordsSource, type SourceRecord };

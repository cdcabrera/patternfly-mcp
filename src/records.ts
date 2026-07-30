/**
 * Public barrel for data-source records.
 * Add new sources by adding one `export * as <id>` line.
 */

// Neutral shape shared by all future sources.
/**
 * Neutral record shape for any data source that feeds the resources blender.
 * A "source" can be the PatternFly API crawler, a git-repo scraper, a
 * non-PatternFly API adapter, etc.
 */
export interface SourceRecord {
  /** Stable source identifier, e.g. 'patternfly-api', 'patternfly-git', 'react-aria'. */
  sourceId: string;
  /** Coarse content class used by the blender to pick a policy. */
  kind: 'component' | 'guideline' | 'example' | 'schema' | 'prose';
  /** Normalized join key (lowercased component name / pathSlug). */
  key: string;
  /** Optional version tag: patternfly major, git sha/tag, semver, etc. */
  version?: string;
  /** Free-form payload; blender inspects `props`, `css`, `content`. */
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
export interface RecordsSource<Options = unknown, Ctx = unknown> {
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

// Concrete crawler primitives (kept exposed for direct/test use).
export {
  apiSpider,
  crawler,
  parsePayload,
  isEmptyPayload
} from './records.patternFlyApi.js';

// Namespaced source adapters — additive; new sources add one line here.
export * as patternFlyApi from './records.patternFly.js';
export * as patternFlyIpc from './records.patternFlyIpc.js';

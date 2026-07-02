import { type CrawlEmit, type CrawlControl, type CrawlSettings, crawl, type CrawlStep } from './records.spider';
import { getOptions } from './options.context';

/**
 * Settings for the Astro spider.
 *
 * @interface AstroCrawlSettings
 * @property base - Base URL for the Astro API.
 */
interface AstroCrawlSettings extends CrawlSettings {
  base?: string;
}

/**
 * Astro-specific CrawlStep factory.
 * Translates Astro's positional URL segments into semantic context.
 *
 * @param base - Base URL for the Astro API. Defaults to global options API setting.
 * @returns A CrawlStep function.
 */
const makeAstroCrawlStep = (base?: string): CrawlStep => {
  const options = getOptions();
  const rootBase = base || options.patternflyOptions.api;
  const root = rootBase.replace(/\/+$/, '');

  return async (emit: CrawlEmit, control: CrawlControl) => {
    const rel = emit.url.startsWith(root) ? emit.url.slice(root.length) : emit.url;
    const segments = rel.replace(/^\/+/, '').split('/').filter(Boolean);
    const depth = segments.length;

    // We only try to parse JSON if we are not at a leaf node or if it looks like JSON
    let json: unknown = null;

    try {
      if (emit.body.trim().startsWith('{') || emit.body.trim().startsWith('[')) {
        json = JSON.parse(emit.body);
      }
    } catch {
      // Not JSON or malformed, that's fine for leaf nodes
    }

    // Root: /versions -> enqueues /<version>
    if (depth === 1 && segments[0] === 'versions') {
      if (Array.isArray(json)) {
        json.forEach(version => {
          if (typeof version === 'string') {
            control.enqueue(`${root}/${version}`);
          }
        });
      }

      return;
    }

    // Depth 1: /<version> -> enqueues /<version>/<section>
    // Depth 2: /<version>/<section> -> enqueues /<version>/<section>/<item>
    // Depth 3: /<version>/<section>/<item> -> enqueues /<version>/<section>/<item>/<facet>
    if (depth >= 1 && depth <= 3) {
      if (Array.isArray(json)) {
        const baseUrl = emit.url.replace(/\/+$/, '');

        json.forEach(pathSegment => {
          if (typeof pathSegment === 'string') {
            control.enqueue(`${baseUrl}/${pathSegment}`);
          }
        });
      }

      // At depth 3, also probe for props and css as per legacy adapter
      if (depth === 3) {
        const baseUrl = emit.url.replace(/\/+$/, '');

        control.enqueue(`${baseUrl}/props`);
        control.enqueue(`${baseUrl}/css`);
      }

      return;
    }

    // Depth >= 4: /<version>/<section>/<item>/<facet> -> leaf content
    if (depth >= 4) {
      const [version, section, item, facet] = segments;

      /* eslint-disable no-param-reassign */
      if (version) {
        emit.semanticContext.version = version;
      }

      if (section) {
        emit.semanticContext.section = section;
      }

      if (item) {
        emit.semanticContext.item = item;
      }

      if (facet) {
        emit.semanticContext.facet = facet;
      }
      /* eslint-enable no-param-reassign */
    }
  };
};

/**
 * Run the Astro spider starting from the versions index.
 *
 * @param settings - Crawl settings including optional Astro base URL.
 * @returns List of results.
 */
const runAstroSpider = async (settings: AstroCrawlSettings = {}) => {
  const options = getOptions();
  const base = settings.base || options.patternflyOptions.api;
  const seed = `${base.replace(/\/+$/, '')}/versions`;

  return crawl([seed], makeAstroCrawlStep(base), settings);
};

export { makeAstroCrawlStep, runAstroSpider, type AstroCrawlSettings };

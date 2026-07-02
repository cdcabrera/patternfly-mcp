import { type CrawlEmit, type CrawlControl, type CrawlOptions, crawl } from './records.spider';

const ASTRO_API_BASE = 'https://www.patternfly.org/api';

/**
 * Astro-specific CrawlStep factory.
 * Translates Astro's positional URL segments into semantic context.
 *
 * @param base - Base URL for the Astro API
 * @returns A CrawlStep function
 */
function makeAstroCrawlStep(base: string = ASTRO_API_BASE) {
  const root = base.replace(/\/+$/, '');

  return async (emit: CrawlEmit, control: CrawlControl) => {
    const rel = emit.url.startsWith(root) ? emit.url.slice(root.length) : emit.url;
    const segments = rel.replace(/^\/+/, '').split('/').filter(Boolean);
    const depth = segments.length;

    // We only try to parse JSON if we are not at a leaf node or if it looks like JSON
    let json: any = null;

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
        json.forEach(version => control.enqueue(`${root}/${version}`));
      }

      return;
    }

    // Depth 1: /<version> -> enqueues /<version>/<section>
    // Depth 2: /<version>/<section> -> enqueues /<version>/<section>/<item>
    // Depth 3: /<version>/<section>/<item> -> enqueues /<version>/<section>/<item>/<facet>
    if (depth >= 1 && depth <= 3) {
      if (Array.isArray(json)) {
        const baseUrl = emit.url.replace(/\/+$/, '');

        json.forEach(pathSegment => control.enqueue(`${baseUrl}/${pathSegment}`));
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
}

/**
 * Run the Astro spider starting from the versions index.
 *
 * @param options - Crawl options
 * @returns List of results
 */
async function runAstroSpider(options: CrawlOptions = {}) {
  const base = (options as any).base || ASTRO_API_BASE;
  const seed = `${base.replace(/\/+$/, '')}/versions`;

  return crawl([seed], makeAstroCrawlStep(base), options);
}

export { ASTRO_API_BASE, makeAstroCrawlStep, runAstroSpider };

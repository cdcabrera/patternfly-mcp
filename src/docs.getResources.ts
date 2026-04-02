import { log, formatUnknownError } from './logger';
import { type PatternFlyMcpDocsCatalog, type PatternFlyMcpDocsCatalogDoc } from './docs.embedded';
import { toCamelCase, toDisplayName, joinUrl } from './server.helpers';
import { loadFileFetch } from './server.getResources';

/**
 * Recursively spider through documentation API segments.
 *
 * @param baseUrl - The current URL to spider
 * @param parts - Accumulated path parts (e.g., [version, section, page])
 * @param context - Shared context for the spider run
 * @param context.version
 * @param context.running
 * @param context.abortController
 * @param catalog - The catalog to populate
 * @returns A promise that resolves when the current segment and its children are processed
 */
const spiderSegments = async (
  baseUrl: string,
  parts: string[],
  context: { version: string; running: () => boolean; abortController: AbortController },
  catalog: PatternFlyMcpDocsCatalog
): Promise<void> => {
  if (!context.running()) {
    return;
  }

  try {
    const { content, resolvedPath } = await loadFileFetch(baseUrl, { signal: context.abortController.signal });
    let segments: unknown;

    try {
      segments = JSON.parse(content);
    } catch {
      // If not JSON, it's terminal content
      segments = null;
    }

    // Terminal Detection: Non-array or explicitly requested terminal path
    const isTerminal = !Array.isArray(segments) || resolvedPath.endsWith('/text');

    if (isTerminal) {
      const page = parts[parts.length - 2] || 'unknown';
      const section = parts[1] || 'other';
      const category = parts[parts.length - 1] || 'general';

      const unifiedName = category === 'react'
        ? toCamelCase(page)
        : toCamelCase(`${page}_${category}`);

      const entry: PatternFlyMcpDocsCatalogDoc = {
        displayName: `${toDisplayName(page)} (${toDisplayName(category)})`,
        description: `PatternFly ${toDisplayName(section)} documentation for ${page} (${category}).`,
        pathSlug: page.replace(/_/g, '-'),
        section,
        category,
        source: 'api',
        version: context.version,
        path: resolvedPath
      };

      /* eslint-disable no-param-reassign */
      catalog.docs[unifiedName] ??= [];
      catalog.docs[unifiedName].push(entry);
      catalog.meta.totalEntries += 1;
      catalog.meta.totalDocs += 1;

      log.info('Build docs', `  [${catalog.meta.totalDocs}] Added entry for ${page} (${category})`);

      return;
    }

    // If array, it's a directory: recurse
    const childSegments = segments as string[];

    for (const segment of childSegments) {
      if (!context.running()) {
        break;
      }

      await spiderSegments(joinUrl(baseUrl, segment), [...parts, segment], context, catalog);
    }
  } catch (error) {
    log.error(`Build docs`, `API spider failed for ${baseUrl}: ${formatUnknownError(error)}`);
  }
};

const runSpider = async () => {};

export { spiderSegments, runSpider };

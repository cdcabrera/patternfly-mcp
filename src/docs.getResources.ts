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
 * @param context.visited - Set of visited URLs to prevent cycles
 * @param context.throttleMs - Delay between requests in milliseconds
 * @param catalog - The catalog to populate
 * @returns A promise that resolves when the current segment and its children are processed
 */
const spiderSegments = async (
  baseUrl: string,
  parts: string[],
  context: {
    version: string;
    running: () => boolean;
    abortController: AbortController;
    visited: Set<string>;
    throttleMs: number;
  },
  catalog: PatternFlyMcpDocsCatalog
): Promise<void> => {
  const normalizedUrl = new URL(baseUrl).toString();

  if (!context.running() || context.visited.has(normalizedUrl)) {
    return;
  }
  context.visited.add(normalizedUrl);

  // Throttling
  if (context.throttleMs > 0) {
    await new Promise(resolve => setTimeout(resolve, context.throttleMs));
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

/**
 * Placeholder for DocsSpider type, to be implemented in Phase 2.
 */
type DocsSpider = {
  close(): Promise<void>;
};

/**
 * Run the documentation spider to build a catalog.
 *
 * @param baseUrl - The root API URL to start spidering from
 * @param version - The PatternFly version being spidered (e.g., 'v6')
 * @param options - Spider options
 * @param options.running - Callback to check if spider should continue
 * @param options.abortController - Optional AbortController for cancellation
 * @param options.throttleMs - Optional delay between requests
 * @returns The populated documentation catalog
 */
const runSpider = async (
  baseUrl: string,
  version: string,
  options: {
    running: () => boolean;
    abortController?: AbortController;
    throttleMs?: number;
  }
): Promise<PatternFlyMcpDocsCatalog> => {
  const catalog: PatternFlyMcpDocsCatalog = {
    meta: {
      totalEntries: 0,
      totalDocs: 0,
      source: 'api',
      updatedAt: new Date().toISOString()
    },
    docs: {}
  };

  const context = {
    version,
    running: options.running,
    abortController: options.abortController || new AbortController(),
    visited: new Set<string>(),
    throttleMs: options.throttleMs || 0
  };

  log.info('Build docs', `Starting API spider for PatternFly ${version} at ${baseUrl}`);

  await spiderSegments(baseUrl, [version], context, catalog);

  log.info('Build docs', `API spider completed. Added ${catalog.meta.totalDocs} documents.`);

  return catalog;
};

export { spiderSegments, runSpider, type DocsSpider };

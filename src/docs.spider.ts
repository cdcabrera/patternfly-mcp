import { join } from 'node:path';
import { stat, writeFile, rename } from 'node:fs/promises';
import { log, formatUnknownError } from './logger';
import { getOptions } from './options.context';
import { deferTask, type DeferTaskHandle } from './server.task';
import { toCamelCase, toDisplayName, joinUrl } from './server.helpers';
import { loadFileFetch } from './server.getResources';
import { type PatternFlyMcpDocsCatalog, type PatternFlyMcpDocsCatalogDoc } from './docs.embedded';

/**
 * Recursively spider through documentation API segments.
 *
 * @param baseUrl
 * @param parts
 * @param context
 * @param context.version
 * @param context.isRunning
 * @param context.signal
 * @param context.visited
 * @param context.throttleMs
 * @param catalog
 */
const spiderSegments = async (
  baseUrl: string,
  parts: string[],
  context: {
    version: string;
    isRunning: () => boolean;
    signal: AbortSignal;
    visited: Set<string>;
    throttleMs: number;
  },
  catalog: PatternFlyMcpDocsCatalog
): Promise<void> => {
  const normalizedUrl = new URL(baseUrl).toString();

  if (!context.isRunning() || context.visited.has(normalizedUrl)) {
    return;
  }
  context.visited.add(normalizedUrl);

  if (context.throttleMs > 0) {
    await new Promise(resolve => setTimeout(resolve, context.throttleMs));
  }

  try {
    const { content, resolvedPath } = await loadFileFetch(baseUrl, { signal: context.signal });
    let segments: unknown;

    try {
      segments = JSON.parse(content);
    } catch {
      segments = null;
    }

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

      catalog.docs[unifiedName] ??= [];
      catalog.docs[unifiedName].push(entry);
      catalog.meta.totalEntries += 1;
      catalog.meta.totalDocs += 1;

      return;
    }

    const childSegments = segments as string[];

    for (const segment of childSegments) {
      if (!context.isRunning()) { break; }
      await spiderSegments(joinUrl(baseUrl, segment), [...parts, segment], context, catalog);
    }
  } catch (error) {
    log.error('Build docs', `API spider failed for ${baseUrl}: ${formatUnknownError(error)}`);
  }
};

/**
 * Run the documentation spider to build a catalog.
 *
 * @param baseUrl
 * @param version
 * @param options
 * @param options.throttleMs
 */
const runSpider = (baseUrl: string, version: string, options: { throttleMs?: number } = {}) => {
  const controller = new AbortController();
  let isRunning = true;

  const catalog: PatternFlyMcpDocsCatalog = {
    meta: {
      totalEntries: 0,
      totalDocs: 0,
      source: 'api',
      updatedAt: new Date().toISOString()
    },
    docs: {}
  };

  return {
    isRunning: () => isRunning,
    stop: async () => {
      isRunning = false;
      controller.abort();
    },
    start: async (): Promise<PatternFlyMcpDocsCatalog> => {
      log.info('Build docs', `Starting API spider for PatternFly ${version} at ${baseUrl}`);

      await spiderSegments(baseUrl, [version], {
        version,
        isRunning: () => isRunning,
        signal: controller.signal,
        visited: new Set<string>(),
        throttleMs: options.throttleMs || 0
      }, catalog);

      log.info('Build docs', `API spider completed. Added ${catalog.meta.totalDocs} documents.`);

      return catalog;
    }
  };
};

/**
 * Check if the documentation catalog needs to be updated.
 *
 * @param filePath
 * @param expireDays
 */
const needsUpdate = async (filePath: string, expireDays: number): Promise<boolean> => {
  try {
    const stats = await stat(filePath);

    return (Date.now() - stats.mtimeMs) > (expireDays * 24 * 60 * 60 * 1000);
  } catch {
    return true;
  }
};

/**
 * Build the documentation catalog and write it to disk.
 *
 * @param root0
 * @param root0.force
 */
const buildDocs = ({ force = false }: { force?: boolean } = {}): DeferTaskHandle<void> => {
  const spiderTask = deferTask(async () => {
    const { patternflyOptions, contextPath } = getOptions();
    const { api: apiOptions, default: pfDefaults } = patternflyOptions;
    const catalogPath = join(contextPath, 'src', 'api.json');

    if (!force && !await needsUpdate(catalogPath, apiOptions.expireDays)) {
      log.info('Build docs', 'Documentation catalog is up to date.');

      return;
    }

    // Resolve endpoint from the new versioned list
    const version = pfDefaults.latestVersion;
    const baseUrl = apiOptions.endpoints.find(url => url.includes(version));

    if (!baseUrl) {
      log.error('Build docs', `No API endpoint found for version ${version}`);

      return;
    }

    const spider = runSpider(baseUrl, version);

    try {
      const catalogProcess = spider.start();

      if (!spider.isRunning()) {
        log.info('Build docs', 'Build docs cancelled.');

        return;
      }

      const catalog = await catalogProcess;
      const tmpPath = `${catalogPath}.tmp`;

      await writeFile(tmpPath, JSON.stringify(catalog, null, 2));
      await rename(tmpPath, catalogPath);

      log.info('Build docs', `Successfully updated ${catalogPath}`);
    } catch (error) {
      log.error('Build docs', `Failed to build documentation catalog: ${error}`);
      throw error;
    } finally {
      // Only necessary as a fallback.
      spider.stop();
    }
  }, {
    timeoutMs: 60_000,
    errorMessage: 'Documentation build timed out after 60 seconds'
  });

  return spiderTask;
};

/**
 * Task for building documentation, with timeout and error handling.
 */
buildDocs.task = deferTask(buildDocs, {
  timeoutMs: 60_000,
  errorMessage: 'Documentation build timed out after 60 seconds'
});

const sendDocsHostShutdown = async () => {};

export { buildDocs, needsUpdate, sendDocsHostShutdown, runSpider };

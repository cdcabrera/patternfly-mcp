import { join } from 'node:path';
import { stat, writeFile, rename } from 'node:fs/promises';
import { log } from './logger';
import { getOptions } from './options.context';
import { runSpider } from './docs.getResources';

/**
 * Check if the documentation catalog needs to be updated.
 *
 * @param filePath - Path to the catalog file
 * @param expireDays - Number of days before the catalog expires
 * @returns True if the file is missing or older than expireDays
 */
const needsUpdate = async (filePath: string, expireDays: number): Promise<boolean> => {
  try {
    const stats = await stat(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const expireMs = expireDays * 24 * 60 * 60 * 1000;

    return ageMs > expireMs;
  } catch {
    // File doesn't exist or is inaccessible
    return true;
  }
};

/**
 * Build the documentation catalog and write it to disk.
 *
 * @param options - Build options
 * @param options.force - Force build even if not expired
 * @param options.running - Callback to check if build should continue
 */
const buildDocs = async ({
  force = false,
  running = () => true
}: {
  force?: boolean;
  running?: () => boolean;
} = {}) => {
  const { patternflyOptions, contextPath } = getOptions();
  const apiOptions = patternflyOptions.api;
  const catalogPath = join(contextPath, 'src', 'api.json');

  if (!force && !await needsUpdate(catalogPath, apiOptions.expireDays)) {
    log.info('Build docs', 'Documentation catalog is up to date.');

    return;
  }

  // Currently, only v6 crawling is supported as per options
  const version = 'v6';
  const baseUrl = apiOptions.endpoints[version];

  if (!baseUrl) {
    log.error('Build docs', `No API endpoint found for version ${version}`);

    return;
  }

  try {
    const catalog = await runSpider(baseUrl, version, { running });

    if (!running()) {
      log.info('Build docs', 'Build docs cancelled.');

      return;
    }

    // Atomic write: write to .tmp then rename
    const tmpPath = `${catalogPath}.tmp`;

    await writeFile(tmpPath, JSON.stringify(catalog, null, 2));
    await rename(tmpPath, catalogPath);

    log.info('Build docs', `Successfully updated ${catalogPath}`);
  } catch (error) {
    log.error('Build docs', `Failed to build documentation catalog: ${error}`);
  }
};

/**
 * Placeholder for sendDocsHostShutdown, to be implemented in Phase 2.
 */
const sendDocsHostShutdown = async () => {};

export { buildDocs, needsUpdate, sendDocsHostShutdown };

import { getOptions } from './options.context';
import {
  findNearestPackageJson,
  matchPackageVersion,
  readLocalFileFunction
} from './server.getResources';
import { fuzzySearch } from './server.search';
import { memo } from './server.caching';

/**
 * Find the closest PatternFly version used within the project context.
 *
 * Logic:
 * 1. Locates the nearest package.json.
 * 2. Scans whitelisted dependencies using fuzzy matching.
 * 3. Aggregates, filters all detected versions that exist in the documentation catalog.
 * 4. Resolves the final version using the optional configured strategy (e.g. target the highest version, target the lowest version).
 *
 * @param contextPathOverride - Optional override for the context path to search for package.json
 * @param options - Global options
 * @returns Matched PatternFly major version alias (e.g., 'v6', 'v5')
 */
const findClosestPatternFlyVersion = async (
  contextPathOverride: string | undefined = undefined,
  options = getOptions()
): Promise<string> => {
  const availableVersions = options.patternflyOptions.availableResourceVersions;
  const { defaultVersion, versionWhitelist, versionStrategy } = options.patternflyOptions.default;
  const pkgPath = await findNearestPackageJson(contextPathOverride || options.contextPath);

  if (!pkgPath) {
    return defaultVersion;
  }

  try {
    const content = await readLocalFileFunction.memo(pkgPath);
    const pkg = JSON.parse(content);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    const depNames = Object.keys(allDeps);

    const detectedVersions = new Set<string>();

    for (const pkgName of versionWhitelist) {
      // Allow for variations like -next or -alpha with fuzzySearch maxDistance=2
      const matches = fuzzySearch(pkgName, depNames, {
        maxDistance: 2,
        isFuzzyMatch: true
      });

      for (const match of matches) {
        const versionMatch = matchPackageVersion(allDeps[match.item], availableVersions);

        if (versionMatch) {
          detectedVersions.add(versionMatch as string);
        }
      }
    }

    if (detectedVersions.size === 0) {
      return defaultVersion;
    }

    if (detectedVersions.size === 1) {
      return Array.from(detectedVersions)[0] as string;
    }

    const sorted = sortPackageVersions(detectedVersions);

    return versionStrategy === 'highest'
      ? (sorted[sorted.length - 1] as string)
      : (sorted[0] as string);
  } catch {
    return defaultVersion;
  }
};

/**
 * Memoized version of findClosestPatternFlyVersion.
 */
findClosestPatternFlyVersion.memo = memo(findClosestPatternFlyVersion);

export { findClosestPatternFlyVersion };

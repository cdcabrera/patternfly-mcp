import { memo } from './server.caching';
import patternFlyDocsCatalog from './docs.json';

/**
 * PatternFly JSON catalog documentation entries
 */
type PatternFlyMcpDocEntry = {
  displayName: string;
  description: string;
  pathSlug: string;
  section: string;
  category: string;
  source: string;
  path: string;
  version: string;
};

/**
 * PatternFly JSON catalog
 *
 * @interface PatternFlyMcpDocs
 */
interface PatternFlyMcpDocs {
  [key: string]: PatternFlyMcpDocEntry[];
}

/**
 * PatternFly JSON catalog by section.
 *
 * @alias PatternFlyMcpDocs
 */
type PatternFlyMcpDocsBySection = PatternFlyMcpDocs;

/**
 * PatternFly JSON catalog by category.
 *
 * @alias PatternFlyMcpDocs
 */
type PatternFlyMcpDocsByCategory = PatternFlyMcpDocs;

/**
 * Get an documentation breakdown by original, section, category, and available version from the JSON catalog.
 *
 * @returns An object containing the original documentation, available versions, section breakdown, and category breakdown.
 */
const getPatternFlyMcpDocs = () => {
  const originalDocs: PatternFlyMcpDocs = patternFlyDocsCatalog.docs;
  const bySection: PatternFlyMcpDocsBySection = {};
  const byCategory: PatternFlyMcpDocsByCategory = {};
  const availableVersions = new Set<string>();

  Object.entries(originalDocs).forEach(([_name, entries]) => {
    entries.forEach(entry => {
      if (entry.version) {
        availableVersions.add(entry.version);
      }

      if (entry.section) {
        bySection[entry.section] ??= [];
        bySection[entry.section]?.push(entry);
      }

      if (entry.category) {
        byCategory[entry.category] ??= [];
        byCategory[entry.category]?.push(entry);
      }
    });
  });

  return {
    original: originalDocs,
    availableVersions: Array.from(availableVersions).sort((a, b) => b.localeCompare(a)),
    bySection,
    byCategory
  };
};

/**
 * Memoized version of getPatternFlyLocalDocs.
 */
getPatternFlyMcpDocs.memo = memo(getPatternFlyMcpDocs);

export {
  getPatternFlyMcpDocs,
  type PatternFlyMcpDocEntry,
  type PatternFlyMcpDocs,
  type PatternFlyMcpDocsBySection,
  type PatternFlyMcpDocsByCategory
};

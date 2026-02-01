import { componentNames as pfComponentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import patternFlyDocsCatalog from './docs.json';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';

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
 * PatternFly JSON catalog, the original JSON.
 *
 * @interface PatternFlyMcpDocs
 */
interface PatternFlyMcpDocs {
  [key: string]: PatternFlyMcpDocEntry[];
}

/**
 * PatternFly JSON catalog by section with an array of entries.
 *
 * @alias PatternFlyMcpDocs
 */
type PatternFlyMcpDocsBySection = PatternFlyMcpDocs;

/**
 * PatternFly JSON catalog by category with an array of entries.
 *
 * @alias PatternFlyMcpDocs
 */
type PatternFlyMcpDocsByCategory = PatternFlyMcpDocs;

/**
 * PatternFly JSON catalog by path with an entry plus the name of the entry.
 */
type PatternFlyMcpDocsByPathEntry = PatternFlyMcpDocEntry & { name: string };

/**
 * PatternFly JSON catalog by path with an entry.
 */
type PatternFlyMcpDocsByPath = {
  [path: string]: PatternFlyMcpDocsByPathEntry;
};

/**
 * PatternFly JSON catalog by name with a path array.
 */
type PatternFlyMcpDocsByNameWithPath = {
  [name: string]: string[]
};

/**
 * Get a multifaceted documentation breakdown from the JSON catalog.
 *
 * @returns A multifaceted documentation breakdown. Use the "memoized" property for performance.
 */
const getPatternFlyMcpDocs = (): {
  original: PatternFlyMcpDocs,
  availableVersions: string[],
  nameIndex: string[],
  bySection: PatternFlyMcpDocsBySection,
  byCategory: PatternFlyMcpDocsByCategory,
  byGuidance: PatternFlyMcpDocsByCategory,
  byPath: PatternFlyMcpDocsByPath,
  byNameWithPath: PatternFlyMcpDocsByNameWithPath,
  byNameWithPathGuidance: PatternFlyMcpDocsByNameWithPath,
  byNameWithPathNoGuidance: PatternFlyMcpDocsByNameWithPath
} => {
  const originalDocs: PatternFlyMcpDocs = patternFlyDocsCatalog.docs;
  const bySection: PatternFlyMcpDocsBySection = {};
  const byCategory: PatternFlyMcpDocsByCategory = {};
  const byGuidance: PatternFlyMcpDocsByCategory = {};
  const byPath: PatternFlyMcpDocsByPath = {};
  const byNameWithPath: PatternFlyMcpDocsByNameWithPath = {};
  const byNameWithPathGuidance: PatternFlyMcpDocsByNameWithPath = {};
  const byNameWithPathNoGuidance: PatternFlyMcpDocsByNameWithPath = {};
  const availableVersions = new Set<string>();
  const nameIndex = new Set<string>();
  const pathSeen = new Set<string>();

  Object.entries(originalDocs).forEach(([name, entries]) => {
    nameIndex.add(name);

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

        if (entry.section === 'guidelines') {
          byGuidance[entry.category] ??= [];
          byGuidance[entry.category]?.push(entry);
        }
      }

      if (entry.path) {
        byPath[entry.path] ??= { ...entry, name };

        if (!pathSeen.has(entry.path)) {
          pathSeen.add(entry.path);

          byNameWithPath[name] ??= [];
          byNameWithPath[name].push(entry.path);

          if (entry.section === 'guidelines') {
            byNameWithPathGuidance[name] ??= [];
            byNameWithPathGuidance[name].push(entry.path);
          } else {
            byNameWithPathNoGuidance[name] ??= [];
            byNameWithPathNoGuidance[name].push(entry.path);
          }
        }
      }
    });
  });

  Object.entries(byNameWithPath).forEach(([_name, paths]) => {
    paths.sort((a, b) => b.localeCompare(a));
  });

  Object.entries(byNameWithPathGuidance).forEach(([_name, paths]) => {
    paths.sort((a, b) => b.localeCompare(a));
  });

  Object.entries(byNameWithPathNoGuidance).forEach(([_name, paths]) => {
    paths.sort((a, b) => b.localeCompare(a));
  });

  return {
    original: originalDocs,
    availableVersions: Array.from(availableVersions).sort((a, b) => b.localeCompare(a)),
    nameIndex: Array.from(nameIndex).sort((a, b) => a.localeCompare(b)),
    bySection,
    byCategory,
    byGuidance,
    byPath,
    byNameWithPath,
    byNameWithPathGuidance,
    byNameWithPathNoGuidance
  };
};

/**
 * Memoized version of getPatternFlyLocalDocs.
 */
getPatternFlyMcpDocs.memo = memo(getPatternFlyMcpDocs);

/**
 * A multifaceted list of all PatternFly React component names.
 *
 * @note The "table" component is manually added to the `allComponentNames` list because it's not currently included
 * in the component schemas package.
 *
 * @returns A multifaceted React component breakdown.  Use the "memoized" property for performance.
 */
const getPatternFlyReactComponentNames = () => ({
  nameIndex: Array.from(new Set([...pfComponentNames, 'Table'])).sort((a, b) => a.localeCompare(b)),
  componentNamesWithSchema: pfComponentNames.sort((a, b) => a.localeCompare(b))
});

/**
 * Memoized version of getPatternFlyReactComponentNames.
 */
getPatternFlyReactComponentNames.memo = memo(getPatternFlyReactComponentNames);

/**
 * Get the component schema from @patternfly/patternfly-component-schemas.
 *
 * @param componentName -
 * @returns
 */
const getPatternFlyComponentSchema = async (componentName: string) => {
  try {
    return await getComponentSchema(componentName);
  } catch {}

  return undefined;
};

/**
 * Memoized version of getComponentSchema.
 */
getPatternFlyComponentSchema.memo = memo(getPatternFlyComponentSchema, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

/**
 * A multifaceted object of ALL available PatternFly MCP resources, e.g. component schemas, documentation, and MCP resources.
 *
 * @returns A multifaceted resource breakdown.  Use the "memoized" property for performance.
 */
const getPatternFlyMcpResources = () => ({
  nameIndex: Array.from(new Set([
    ...getPatternFlyReactComponentNames.memo().nameIndex,
    ...getPatternFlyMcpDocs.memo().nameIndex
  ])).sort((a, b) => a.localeCompare(b))
});

/**
 * Memoized version of getPatternFlyMcpResources.
 */
getPatternFlyMcpResources.memo = memo(getPatternFlyMcpResources);

export {
  getPatternFlyComponentSchema,
  getPatternFlyMcpDocs,
  getPatternFlyMcpResources,
  getPatternFlyReactComponentNames,
  type PatternFlyMcpDocEntry,
  type PatternFlyMcpDocs,
  type PatternFlyMcpDocsBySection,
  type PatternFlyMcpDocsByCategory,
  type PatternFlyMcpDocsByPath,
  type PatternFlyMcpDocsByPathEntry,
  type PatternFlyMcpDocsByNameWithPath
};

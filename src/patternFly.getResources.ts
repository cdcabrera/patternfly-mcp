import { componentNames as pfComponentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import patternFlyDocsCatalog from './docs.json';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { isPlainObject } from './server.helpers';
import { findClosestPatternFlyVersion } from './patternFly.helpers';

/**
 * Derive the component schema type from @patternfly/patternfly-component-schemas
 */
type PatternFlyComponentSchema = Awaited<ReturnType<typeof getPatternFlyComponentSchema>>;

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
 * PatternFly JSON catalog by path with an entry.
 */
type PatternFlyMcpDocsByPath = {
  [path: string]: PatternFlyMcpDocEntry & { name: string };
};

/**
 * PatternFly JSON catalog by name with a path array.
 */
type PatternFlyMcpDocsByNameWithPath = {
  [name: string]: string[];
};

/**
 * PatternFly JSON catalog by version with an entry plus the name of the entry.
 */
type PatternFlyMcpDocsByVersion = {
  [path: string]: (PatternFlyMcpDocEntry & { name: string })[];
};

/**
 * PatternFly JSON catalog by version by key with a list of entries.
 */
type PatternFlyMcpDocsByVersionByKey = {
  [version: string]: {
    [key: string]: (PatternFlyMcpDocEntry & { name: string })[];
  };
};

type PatternFlyMcpDocsByVersionByKeyWithList = {
  [version: string]: {
    [key: string]: string[];
  };
};

/**
 * Pre-sorted and formatted PatternFly JSON catalog for MCP documentation.
 *
 * @interface PatternFlyMcpAvailableDocs
 *
 * @property {PatternFlyMcpDocs} original - Original PatternFly JSON catalog, (e.g. `byName` with entries)
 * @property availableVersions - All available tag versions of PatternFly provided by docs resources, sorted latest to oldest
 * @property categoryIndex - All available categories of PatternFly, sorted alphabetically
 * @property closestVersion - Closest tag version of PatternFly to the current version, (e.g. "v4", "v5", "v6")
 * @property closestSemVer - Closest version of PatternFly to the current version, (e.g. "4.0.0", "5.0.0", "6.0.0")
 * @property latestVersion - Latest tag version of PatternFly, (e.g. "v4", "v5", "v6")
 * @property nameIndex - All available documentation names as a list, sorted alphabetically
 * @property pathIndex - All available documentation paths as a list, sorted alphabetically
 * @property resourceMarkdownIndex - All available Markdown formatted documentation paths as a list, sorted alphabetically
 * @property {PatternFlyMcpDocsBySection} bySection - Entire PatternFly JSON catalog by section with entries
 * @property {PatternFlyMcpDocsByCategory} byCategory - Entire PatternFly JSON catalog by category with entries
 * @property {PatternFlyMcpDocsByCategory} byGuidance - PatternFly JSON catalog by category, but only includes AI guidance entries
 * @property {PatternFlyMcpDocsByPath} byPath - Entire PatternFly JSON catalog by path with entries AND the name of the entry
 * @property {PatternFlyMcpDocs} byName - An alias to the `original` PatternFly JSON catalog by name with entries
 * @property {PatternFlyMcpDocs} byNameWithGuidance - Entire PatternFly JSON catalog by name with entries,
 *     but only includes AI guidance entries
 * @property {PatternFlyMcpDocs} byNameWithNoGuidance - Entire PatternFly JSON catalog by name with entries,
 *     but only includes non-AI guidance entries
 * @property {PatternFlyMcpDocsByNameWithPath} byNameWithPath - Entire PatternFly JSON catalog by name with paths only
 * @property {PatternFlyMcpDocsByNameWithPath} byNameWithPathGuidance - Entire PatternFly JSON catalog by name with paths only,
 *     but only includes AI guidance paths
 * @property {PatternFlyMcpDocsByNameWithPath} byNameWithPathResourceMarkdown - Entire PatternFly JSON catalog by name with paths only,
 *     but only includes Markdown formatted paths
 * @property {PatternFlyMcpDocsByNameWithPath} byNameWithPathNoGuidance - Entire PatternFly JSON catalog by name with paths only,
 *     but only includes non-AI guidance paths
 * @property {PatternFlyMcpDocsByVersion} byVersion - Entire PatternFly JSON catalog by version with entries
 * @property {PatternFlyMcpDocsByVersionByKey} byVersionByName - Entire PatternFly JSON catalog by version by name with entries
 * @property {PatternFlyMcpDocsByVersionByKey} byVersionByNameGuidance - Entire PatternFly JSON catalog by version by name with entries,
 *     but only includes AI guidance entries
 * @property {PatternFlyMcpDocsByVersionByKey} byVersionByNameNoGuidance - Entire PatternFly JSON catalog by version by name with entries,
 *     but only includes non-AI guidance entries
 * @property {PatternFlyMcpDocsByVersionByKeyWithList} byVersionByNameWithPath - Entire PatternFly JSON catalog by version by name with entries,
 *     but only includes paths
 * @property {PatternFlyMcpDocsByVersionByKeyWithList} byVersionByNameWithPathGuidance - Entire PatternFly JSON catalog by version by name with entries,
 *     but only includes AI guidance paths
 * @property {PatternFlyMcpDocsByVersionByKeyWithList} byVersionByNameWithPathNoGuidance - Entire PatternFly JSON catalog by version by name with entries,
 *     but only includes non-AI guidance paths
 * @property {PatternFlyMcpDocsByVersionByKey} byVersionByPath - Entire PatternFly JSON catalog by version by path with entries
 * @property {PatternFlyMcpDocsByVersionByKey} byVersionByCategory - Entire PatternFly JSON catalog by version by category with entries
 */
interface PatternFlyMcpAvailableDocs {
  original: PatternFlyMcpDocs;
  availableVersions: string[];
  categoryIndex: string[];
  closestVersion: string;
  closestSemVer: string;
  latestVersion: string;
  nameIndex: string[];
  pathIndex: string[];
  resourceMarkdownIndex: string[];
  bySection: PatternFlyMcpDocsBySection;
  byCategory: PatternFlyMcpDocsByCategory;
  byGuidance: PatternFlyMcpDocsByCategory;
  byPath: PatternFlyMcpDocsByPath;
  byName: PatternFlyMcpDocs;
  byNameWithGuidance: PatternFlyMcpDocs;
  byNameWithNoGuidance: PatternFlyMcpDocs;
  byNameWithPath: PatternFlyMcpDocsByNameWithPath;
  byNameWithPathGuidance: PatternFlyMcpDocsByNameWithPath;
  byNameWithPathResourceMarkdown: PatternFlyMcpDocsByNameWithPath;
  byNameWithPathNoGuidance: PatternFlyMcpDocsByNameWithPath;
  byVersion: PatternFlyMcpDocsByVersion;
  byVersionByName: PatternFlyMcpDocsByVersionByKey;
  byVersionByNameGuidance: PatternFlyMcpDocsByVersionByKey;
  byVersionByNameNoGuidance: PatternFlyMcpDocsByVersionByKey;
  byVersionByNameWithPath: PatternFlyMcpDocsByVersionByKeyWithList;
  byVersionByNameWithPathGuidance: PatternFlyMcpDocsByVersionByKeyWithList;
  byVersionByNameWithPathNoGuidance: PatternFlyMcpDocsByVersionByKeyWithList;
  byVersionByPath: PatternFlyMcpDocsByVersionByKey;
  byVersionByCategory: PatternFlyMcpDocsByVersionByKey;
}

/**
 * Set the category display label based on the entry's section and category.
 *
 * @param entry - PatternFly documentation entry
 */
const setCategoryDisplayLabel = (entry?: PatternFlyMcpDocEntry) => {
  let categoryLabel = entry?.category || 'Documentation';

  if (!isPlainObject(entry)) {
    return categoryLabel;
  }

  switch (categoryLabel) {
    case 'design-guidelines':
      categoryLabel = 'Design Guidelines';
      break;
    case 'accessibility':
      categoryLabel = 'Accessibility';
      break;
    case 'react':
      categoryLabel = 'Examples';
      break;
    default:
      categoryLabel = categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1);
      break;
  }

  return entry.section === 'guidelines' ? 'AI Guidance' : categoryLabel;
};

/**
 * Get a multifaceted documentation breakdown from the JSON catalog.
 *
 * @returns A multifaceted documentation breakdown. Use the "memoized" property for performance.
 */
const getPatternFlyMcpDocs = async (): Promise<PatternFlyMcpAvailableDocs> => {
  const closestVersion = await findClosestPatternFlyVersion();
  const originalDocs: PatternFlyMcpDocs = patternFlyDocsCatalog.docs;
  const bySection: PatternFlyMcpDocsBySection = {};
  const byCategory: PatternFlyMcpDocsByCategory = {};
  const byGuidance: PatternFlyMcpDocsByCategory = {};
  const byPath: PatternFlyMcpDocsByPath = {};
  const byName: PatternFlyMcpDocs = patternFlyDocsCatalog.docs;
  const byNameWithPath: PatternFlyMcpDocsByNameWithPath = {};
  const byNameWithPathGuidance: PatternFlyMcpDocsByNameWithPath = {};
  const byNameWithPathResourceMarkdown: PatternFlyMcpDocsByNameWithPath = {};
  const byNameWithPathNoGuidance: PatternFlyMcpDocsByNameWithPath = {};
  const byNameWithGuidance: PatternFlyMcpDocs = {};
  const byNameWithNoGuidance: PatternFlyMcpDocs = {};
  const byVersion: PatternFlyMcpDocsByVersion = {};
  const byVersionByName: PatternFlyMcpDocsByVersionByKey = {};
  const byVersionByNameGuidance: PatternFlyMcpDocsByVersionByKey = {};
  const byVersionByNameNoGuidance: PatternFlyMcpDocsByVersionByKey = {};
  const byVersionByNameWithPath: PatternFlyMcpDocsByVersionByKeyWithList = {};
  const byVersionByNameWithPathGuidance: PatternFlyMcpDocsByVersionByKeyWithList = {};
  const byVersionByNameWithPathNoGuidance: PatternFlyMcpDocsByVersionByKeyWithList = {};
  const byVersionByPath: PatternFlyMcpDocsByVersionByKey = {};
  const byVersionByCategory: PatternFlyMcpDocsByVersionByKey = {};
  const availableVersions = new Set<string>();
  const resourceMarkdownIndex = new Set<string>();
  const nameIndex = new Set<string>();
  const categoryIndex = new Set<string>();
  const pathIndex = new Set<string>();

  const updatedClosestVersion = `v${closestVersion.split('.')[0]}`;
  const closestSemVer = closestVersion;

  Object.entries(originalDocs).forEach(([name, entries]) => {
    nameIndex.add(name);

    entries.forEach(entry => {
      if (entry.version) {
        availableVersions.add(entry.version);

        byVersion[entry.version] ??= [];
        byVersion[entry.version]?.push({ ...entry, name });

        byVersionByName[entry.version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        byVersionByName[entry.version][name] ??= [];
        // @ts-expect-error ignore, nullish assignment
        byVersionByName[entry.version][name].push({ ...entry, name });
      }

      if (entry.section) {
        bySection[entry.section] ??= [];
        bySection[entry.section]?.push(entry);
      }

      if (entry.category) {
        categoryIndex.add(entry.category);

        byVersionByCategory[entry.version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        byVersionByCategory[entry.version][entry.category] ??= [];
        // @ts-expect-error ignore, nullish assignment
        byVersionByCategory[entry.version][entry.category]?.push({ ...entry, name });

        byCategory[entry.category] ??= [];
        byCategory[entry.category]?.push(entry);

        if (entry.section === 'guidelines') {
          byGuidance[entry.category] ??= [];
          byGuidance[entry.category]?.push(entry);
        }
      }

      if (entry.path) {
        byPath[entry.path] ??= { ...entry, name };

        byVersionByPath[entry.version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        byVersionByPath[entry.version][entry.path] ??= [];
        // @ts-expect-error ignore, nullish assignment
        byVersionByPath[entry.version][entry.path].push({ ...entry, name });

        if (!pathIndex.has(entry.path)) {
          pathIndex.add(entry.path);

          byNameWithPath[name] ??= [];
          byNameWithPath[name].push(entry.path);

          byVersionByNameWithPath[entry.version] ??= {};
          // @ts-expect-error ignore, nullish assignment
          byVersionByNameWithPath[entry.version][name] ??= [];
          // @ts-expect-error ignore, nullish assignment
          byVersionByNameWithPath[entry.version][name].push(entry.path);

          const resourceUriMarkdownPath = `[patternfly://docs/${entry.version}/${entry.displayName} - ${setCategoryDisplayLabel(entry)}](${entry.path})`;

          byNameWithPathResourceMarkdown[name] ??= [];
          byNameWithPathResourceMarkdown[name].push(resourceUriMarkdownPath);
          resourceMarkdownIndex.add(resourceUriMarkdownPath);

          if (entry.section === 'guidelines') {
            byVersionByNameWithPathGuidance[entry.version] ??= {};
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameWithPathGuidance[entry.version][name] ??= [];
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameWithPathGuidance[entry.version][name].push(entry.path);

            byNameWithPathGuidance[name] ??= [];
            byNameWithPathGuidance[name].push(entry.path);

            byVersionByNameGuidance[entry.version] ??= {};
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameGuidance[entry.version][name] ??= [];
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameGuidance[entry.version][name].push({ ...entry, name });

            byNameWithGuidance[name] ??= [];
            byNameWithGuidance[name].push({
              ...entry
            });
          } else {
            byVersionByNameWithPathNoGuidance[entry.version] ??= {};
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameWithPathNoGuidance[entry.version][name] ??= [];
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameWithPathNoGuidance[entry.version][name].push(entry.path);

            byNameWithPathNoGuidance[name] ??= [];
            byNameWithPathNoGuidance[name].push(entry.path);

            byVersionByNameNoGuidance[entry.version] ??= {};
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameNoGuidance[entry.version][name] ??= [];
            // @ts-expect-error ignore, nullish assignment
            byVersionByNameNoGuidance[entry.version][name].push({ ...entry, name });

            byNameWithNoGuidance[name] ??= [];
            byNameWithNoGuidance[name].push({
              ...entry
            });
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

  Object.entries(byNameWithGuidance).forEach(([_name, entries]) => {
    entries.sort((a, b) => b.displayName.localeCompare(a.displayName));
  });

  Object.entries(byNameWithPathResourceMarkdown).forEach(([_name, markdownPaths]) => {
    markdownPaths.sort((a, b) => b.localeCompare(a));
  });

  Object.entries(byNameWithPathNoGuidance).forEach(([_name, paths]) => {
    paths.sort((a, b) => b.localeCompare(a));
  });

  Object.entries(byNameWithNoGuidance).forEach(([_name, entries]) => {
    entries.sort((a, b) => b.displayName.localeCompare(a.displayName));
  });

  Object.entries(byVersion).forEach(([_version, entries]) => {
    entries.sort((a, b) => b.name.localeCompare(a.name));
  });

  Object.entries(byVersionByNameWithPath).forEach(([_version, names]) => {
    Object.entries(names).forEach(([_name, paths]) => {
      paths.sort((a, b) => b.localeCompare(a));
    });
  });

  Object.entries(byVersionByNameWithPathGuidance).forEach(([_version, names]) => {
    Object.entries(names).forEach(([_name, paths]) => {
      paths.sort((a, b) => b.localeCompare(a));
    });
  });

  Object.entries(byVersionByNameWithPathNoGuidance).forEach(([_version, names]) => {
    Object.entries(names).forEach(([_name, paths]) => {
      paths.sort((a, b) => b.localeCompare(a));
    });
  });

  const updatedAvailableVersions = Array.from(availableVersions).sort((a, b) => b.localeCompare(a));

  return {
    original: originalDocs,
    availableVersions: updatedAvailableVersions,
    closestVersion: updatedClosestVersion,
    closestSemVer,
    latestVersion: updatedAvailableVersions[0] || DEFAULT_OPTIONS.patternflyOptions.default.latestVersion,
    categoryIndex: Array.from(categoryIndex).sort((a, b) => a.localeCompare(b)),
    resourceMarkdownIndex: Array.from(resourceMarkdownIndex).sort((a, b) => a.localeCompare(b)),
    nameIndex: Array.from(nameIndex).sort((a, b) => a.localeCompare(b)),
    pathIndex: Array.from(pathIndex).sort((a, b) => a.localeCompare(b)),
    bySection,
    byCategory,
    byGuidance,
    byPath,
    byName,
    byNameWithGuidance,
    byNameWithNoGuidance,
    byNameWithPath,
    byNameWithPathGuidance,
    byNameWithPathResourceMarkdown,
    byNameWithPathNoGuidance,
    byVersion,
    byVersionByName,
    byVersionByNameGuidance,
    byVersionByNameNoGuidance,
    byVersionByPath,
    byVersionByCategory,
    byVersionByNameWithPath,
    byVersionByNameWithPathGuidance,
    byVersionByNameWithPathNoGuidance
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
 * @param componentName - Name of the component to retrieve the schema for.
 * @returns {Promise<PatternFlyComponentSchema|undefined>} The component schema, or `undefined` if the component name is not found.
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
const getPatternFlyMcpResources = async () => {
  const pfMcpDocs = await getPatternFlyMcpDocs.memo();

  return {
    nameIndex: Array.from(new Set([
      ...getPatternFlyReactComponentNames.memo().nameIndex,
      ...pfMcpDocs.nameIndex
    ])).sort((a, b) => a.localeCompare(b)),
    categoryIndex: pfMcpDocs.categoryIndex
  };
};

/**
 * Memoized version of getPatternFlyMcpResources.
 */
getPatternFlyMcpResources.memo = memo(getPatternFlyMcpResources);

export {
  getPatternFlyComponentSchema,
  getPatternFlyMcpDocs,
  getPatternFlyMcpResources,
  getPatternFlyReactComponentNames,
  setCategoryDisplayLabel,
  type PatternFlyComponentSchema,
  type PatternFlyMcpAvailableDocs,
  type PatternFlyMcpDocEntry,
  type PatternFlyMcpDocs,
  type PatternFlyMcpDocsBySection,
  type PatternFlyMcpDocsByCategory,
  type PatternFlyMcpDocsByPath,
  type PatternFlyMcpDocsByNameWithPath,
  type PatternFlyMcpDocsByVersion
};

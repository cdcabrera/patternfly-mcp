import { componentNames as pfComponentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import patternFlyDocsCatalog from './docs.json';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { isPlainObject } from './server.helpers';
import { getPatternFlyVersionContext } from './patternFly.helpers';
import { getOptions } from './options.context';

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
 * PatternFly JSON catalog by path with an entry.
 */
type PatternFlyMcpDocsByPath = {
  [path: string]: PatternFlyMcpDocEntry & { name: string };
};

/**
 * PatternFly JSON catalog by version with an entry.
 */
type PatternFlyMcpDocsByVersion = {
  [version: string]: (PatternFlyMcpDocEntry & { name: string })[];
};

/**
 * PatternFly resource metadata.
 *
 * @note This might need to be called resource metadata. `docs.json` doesn't just contain component metadata.
 *
 * @property name - The name of component entry.
 * @property isSchemasAvailable - Is a component schema available.
 * @property urls - URLs for component documentation.
 * @property urlsNoGuidance - URLs for component documentation without AI guidance.
 * @property urlsGuidance - URLs for component documentation with AI guidance.
 * @property entriesGuidance - PatternFly documentation entries with AI guidance.
 * @property entriesNoGuidance - PatternFly documentation entries without AI guidance.
 * @property versions - PatternFly resources segmented by version.
 */
type PatternFlyMcpResourceMetadata = {
  name: string;
  isSchemasAvailable: boolean;
  urls: string[];
  urlsNoGuidance: string[];
  urlsGuidance: string[];
  entriesGuidance: PatternFlyMcpDocEntry[];
  entriesNoGuidance: PatternFlyMcpDocEntry[];
  versions: Record<string, {
    uris: string[];
    urls: string[];
    urlsGuidance: string[];
    urlsNoGuidance: string[];
    entriesGuidance: PatternFlyMcpDocEntry[];
    entriesNoGuidance: PatternFlyMcpDocEntry[];
  }>;
};

/**
 * Patternfly available documentation.
 *
 * @interface PatternFlyMcpAvailableDocs
 *
 * @property resources - Patternfly available documentation and metadata by resource name.
 * @property availableVersions - Patternfly available versions.
 * @property closestVersion - Patternfly closest version.
 * @property closestSemVer - Patternfly closest semantic version.
 * @property latestVersion - Patternfly latest version.
 * @property markdownIndex - Patternfly documentation markdown index.
 * @property nameIndex - Patternfly documentation name index.
 * @property pathIndex - Patternfly documentation path index.
 * @property uriIndex - Patternfly documentation URI index.
 * @property byPath - Patternfly documentation by path with entries
 * @property byVersion - Patternfly documentation by version with entries
 */
interface PatternFlyMcpAvailableDocs {
  resources: Map<string, PatternFlyMcpResourceMetadata>;
  availableVersions: string[];
  closestVersion: string;
  closestSemVer: string;
  latestVersion: string;
  markdownIndex: string[];
  nameIndex: string[];
  pathIndex: string[];
  uriIndex: string[];
  byPath: PatternFlyMcpDocsByPath;
  byVersion: PatternFlyMcpDocsByVersion;
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
 * Get a multifaceted documentation breakdown from the JSON catalog.
 *
 * @param contextPathOverride - Context path for updating the returned PatternFly versions.
 * @param options - Options.
 * @returns A multifaceted documentation breakdown. Use the "memoized" property for performance.
 */
const getPatternFlyMcpDocs = async (contextPathOverride?: string, options = getOptions()): Promise<PatternFlyMcpAvailableDocs> => {
  const { availableVersions, closestVersion, closestSemVer, latestVersion } = await getPatternFlyVersionContext.memo(contextPathOverride);
  const originalDocs: PatternFlyMcpDocs = patternFlyDocsCatalog.docs;
  const resources = new Map<string, PatternFlyMcpResourceMetadata>();
  const byPath: PatternFlyMcpDocsByPath = {};
  const byVersion: PatternFlyMcpDocsByVersion = {};
  const markdownIndex = new Set<string>();
  const pathIndex = new Set<string>();
  const uriIndex = new Set<string>();
  const { componentNamesWithSchema: schemaNames } = getPatternFlyReactComponentNames.memo();

  Object.entries(originalDocs).forEach(([name, entries]) => {
    const resource: PatternFlyMcpResourceMetadata = {
      name,
      isSchemasAvailable: options.patternflyOptions.default.latestVersion === latestVersion && schemaNames.includes(name),
      urls: [],
      urlsNoGuidance: [],
      urlsGuidance: [],
      entriesGuidance: [],
      entriesNoGuidance: [],
      versions: {}
    };

    entries.forEach(entry => {
      const version = entry.version || 'unknown';

      resource.versions[version] ??= {
        uris: [],
        urls: [],
        urlsGuidance: [],
        urlsNoGuidance: [],
        entriesGuidance: [],
        entriesNoGuidance: []
      };

      byPath[entry.path] = { ...entry, name };

      byVersion[entry.version] ??= [];
      byVersion[entry.version]?.push({ ...entry, name });

      pathIndex.add(entry.path);

      const uri = `patternfly://docs/${version}/${name}`;

      if (!uriIndex.has(uri)) {
        uriIndex.add(`patternfly://docs/${version}/${name}`);
        markdownIndex.add(`[${uri} - ${setCategoryDisplayLabel(entry)}](${entry.path})`);

        resource.versions[version].uris.push(`patternfly://docs/${version}/${name}`);
      }

      resource.urls.push(entry.path);
      resource.versions[version].urls.push(entry.path);

      if (entry.section === 'guidelines') {
        resource.urlsGuidance.push(entry.path);
        resource.entriesGuidance.push(entry);
        resource.versions[version].urlsGuidance.push(entry.path);
        resource.versions[version].entriesGuidance.push(entry);
      } else {
        resource.urlsNoGuidance.push(entry.path);
        resource.entriesNoGuidance.push(entry);
        resource.versions[version].urlsNoGuidance.push(entry.path);
        resource.versions[version].entriesNoGuidance.push(entry);
      }
    });
  });

  Object.entries(byVersion).forEach(([_version, entries]) => {
    entries.sort((a, b) => b.name.localeCompare(a.name));
  });

  return {
    resources,
    availableVersions,
    closestVersion,
    closestSemVer,
    latestVersion,
    markdownIndex: Array.from(markdownIndex).sort((a, b) => a.localeCompare(b)),
    nameIndex: Array.from(resources.keys()).sort((a, b) => a.localeCompare(b)),
    pathIndex: Array.from(pathIndex).sort((a, b) => a.localeCompare(b)),
    uriIndex: Array.from(uriIndex).sort((a, b) => a.localeCompare(b)),
    byPath,
    byVersion
  };
};

/**
 * Memoized version of getPatternFlyLocalDocs.
 */
getPatternFlyMcpDocs.memo = memo(getPatternFlyMcpDocs);

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

export {
  getPatternFlyComponentSchema,
  getPatternFlyMcpDocs,
  getPatternFlyReactComponentNames,
  setCategoryDisplayLabel,
  type PatternFlyComponentSchema,
  type PatternFlyMcpAvailableDocs,
  type PatternFlyMcpResourceMetadata,
  type PatternFlyMcpDocEntry,
  type PatternFlyMcpDocs,
  type PatternFlyMcpDocsByPath,
  type PatternFlyMcpDocsByVersion
};

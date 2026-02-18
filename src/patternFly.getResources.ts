import {
  componentNames as pfComponentNames,
  getComponentSchema
} from '@patternfly/patternfly-component-schemas/json';
// import patternFlyDocsCatalog from './docs.json';
// import myJsonFile from './myJson.json';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { isPlainObject } from './server.helpers';
import {
  getPatternFlyVersionContext,
  type PatternFlyVersionContext
} from './patternFly.helpers';
import { log, formatUnknownError } from './logger';

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
 * PatternFly JSON extended documentation metadata
 */
type PatternFlyMcpDocsMeta = {
  name: string;
  displayCategory: string;
  uri: string;
  uriSchemas?: string | undefined
};

/**
 * PatternFly resource, the original JSON.
 *
 * @interface PatternFlyMcpDocs
 */
interface PatternFlyMcpResources {
  [key: string]: PatternFlyMcpDocEntry[];
}

/**
 * PatternFly resources by Path with an entry.
 */
type PatternFlyMcpResourcesByPath = {
  [path: string]: PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta;
};
// type PatternFlyMcpResourcesByPath = Map<string, PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta>;

/**
 * PatternFly resources by URI with a list of entries.
 */
type PatternFlyMcpResourcesByUri = {
  [uri: string]: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
};

/**
 * PatternFly resources by version with a list of entries.
 */
type PatternFlyMcpResourcesByVersion = {
  [version: string]: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
};

/**
 * PatternFly resource metadata.
 *
 * @note This might need to be called resource metadata. `docs.json` doesn't just contain component metadata.
 *
 * @property name - The name of component entry.
 * @property urls - All entry URLs for component documentation.
 * @property urlsNoGuidance - All entry URLs for component documentation without AI guidance.
 * @property urlsGuidance - All entry URLs for component documentation with AI guidance.
 * @property entriesGuidance - All entry PatternFly documentation entries with AI guidance.
 * @property entriesNoGuidance - All entry PatternFly documentation entries without AI guidance.
 * @property versions - Entry segmented by versions.
 */
type PatternFlyMcpResourceMetadata = {
  name: string;
  // isSchemasAvailable: boolean;
  urls: string[];
  urlsNoGuidance: string[];
  urlsGuidance: string[];
  entriesGuidance: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
  entriesNoGuidance: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
  versions: Record<string, {
    isSchemasAvailable: boolean;
    uri: string;
    uriSchemas: string | undefined;
    urls: string[];
    urlsGuidance: string[];
    urlsNoGuidance: string[];
    entriesGuidance: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
    entriesNoGuidance: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
  }>;
};

/**
 * Patternfly available documentation.
 *
 * @note To avoid lookup issues we normalize most keys and indexes to lowercase, except docs.json `paths`.
 * GitHub has case-sensitive links.
 *
 * @interface PatternFlyMcpAvailableDocs
 *
 * @property resources - Patternfly available documentation and metadata by resource name.
 * @property availableVersions - Patternfly available versions.
 * @property availableSchemaVersions - Patternfly available schema versions.
 * @property closestVersion - Patternfly closest version.
 * @property closestSemVer - Patternfly closest semantic version.
 * @property latestVersion - Patternfly latest version.
 * @property nameIndex - Patternfly documentation name index.
 * @property pathIndex - Patternfly documentation path index.
 * @property byPath - Patternfly documentation by path with entries
 * @property byVersion - Patternfly documentation by version with entries
 */
interface PatternFlyMcpAvailableResources extends PatternFlyVersionContext {
  resources: Map<string, PatternFlyMcpResourceMetadata>;
  // nameIndex: string[];
  docsIndex: string[];
  componentsIndex: string[];
  keywordsIndex: string[];
  pathIndex: string[];
  // uriIndex: string[];
  // uriSchemasIndex: string[];
  byPath: PatternFlyMcpResourcesByPath;
  byUri: PatternFlyMcpResourcesByUri;
  byVersion: PatternFlyMcpResourcesByVersion;
  byVersionComponentNames: {
    [version: string]: string[];
  };
}

/**
 * Lazy load the PatternFly documentation catalog.
 *
 * @returns PatternFly documentation catalog JSON.
 */
const getPatternFlyDocsCatalog = async () => {
  let docsCatalog = { docs: {} };

  try {
    docsCatalog = (await import('#docsCatalog', { with: { type: 'json' } })).default;
  } catch (error) {
    log.debug(`Failed to import docs catalog entry '#docsCatalog': ${formatUnknownError(error)}`);
  }

  return docsCatalog.docs;
};

/**
 * Memoized version of getPatternFlyDocsCatalog.
 */
getPatternFlyDocsCatalog.memo = memo(getPatternFlyDocsCatalog);

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
    case 'grammar':
      categoryLabel = 'Grammar';
      break;
    case 'writing-guides':
      categoryLabel = 'Writing Guidelines';
      break;
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
 * @note To avoid lookup issues we normalize all keys and indexes to lowercase. Component names are lowercased.
 *
 * @param contextPathOverride - Context path for updating the returned PatternFly versions.
 * @returns A multifaceted React component breakdown.  Use the "memoized" property for performance.
 * - `byVersion`: Map of lowercase PatternFly versions to lowercase component names.
 * - `componentNamesIndex`: Environment context, lowercase component names sorted alphabetically.
 * - `componentNamesWithSchemasIndex`: Environment context, Lowercase component names sorted alphabetically.
 * - `componentNamesWithSchemasMap`: Environment context, Map of lowercase component names to original case component names.
 */
const getPatternFlyReactComponentNames = async (contextPathOverride?: string) => {
  const { latestSchemasVersion, isEnvTheLatestSchemasVersion } = await getPatternFlyVersionContext.memo(contextPathOverride);
  const byVersion = new Map<string, string[]>();

  const latestNamesIndex = [...Array.from(new Set([...pfComponentNames, 'Table'])).map(name => name.toLowerCase()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  const latestNamesWithSchemaIndex = [...pfComponentNames.map(name => name.toLowerCase()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  const latestNamesWithSchemasMap = new Map(pfComponentNames.map(name => [name.toLowerCase(), name]));

  byVersion.set(latestSchemasVersion, latestNamesIndex);

  return {
    byVersion: Object.fromEntries(byVersion),
    componentNamesIndex: isEnvTheLatestSchemasVersion ? latestNamesIndex : [],
    componentNamesWithSchemasIndex: isEnvTheLatestSchemasVersion ? latestNamesWithSchemaIndex : [],
    componentNamesWithSchemasMap: isEnvTheLatestSchemasVersion ? Object.fromEntries(latestNamesWithSchemasMap) : {}
  };
};

/**
 * Memoized version of getPatternFlyReactComponentNames.
 */
getPatternFlyReactComponentNames.memo = memo(getPatternFlyReactComponentNames);

/**
 * Get a multifaceted resources breakdown from PatternFly.
 *
 * @param contextPathOverride - Context path for updating the returned PatternFly versions.
 * @returns A multifaceted documentation breakdown. Use the "memoized" property for performance.
 */
const getPatternFlyMcpResources = async (contextPathOverride?: string): Promise<PatternFlyMcpAvailableResources> => {
  const versionContext = await getPatternFlyVersionContext.memo(contextPathOverride);
  const componentNames = await getPatternFlyReactComponentNames.memo(contextPathOverride);
  const { byVersion: componentNamesByVersion, componentNamesIndex, componentNamesWithSchemasIndex: schemaNames } = componentNames;

  const originalDocs: PatternFlyMcpResources = await getPatternFlyDocsCatalog.memo();
  const resources = new Map<string, PatternFlyMcpResourceMetadata>();
  const byPath: PatternFlyMcpResourcesByPath = {};
  const byUri: PatternFlyMcpResourcesByUri = {};
  const byVersion: PatternFlyMcpResourcesByVersion = {};
  const pathIndex = new Set<string>();

  Object.entries(originalDocs).forEach(([docsName, entries]) => {
    const name = docsName.toLowerCase();
    const resource: PatternFlyMcpResourceMetadata = {
      name,
      // isSchemasAvailable,
      urls: [],
      urlsNoGuidance: [],
      urlsGuidance: [],
      entriesGuidance: [],
      entriesNoGuidance: [],
      versions: {}
    };

    entries.forEach(entry => {
      const version = (entry.version || 'unknown').toLowerCase();
      const isSchemasAvailable = versionContext.latestSchemasVersion === version && schemaNames.includes(name);
      const path = entry.path;
      const uri = `patternfly://docs/${version}/${name}`;

      pathIndex.add(path);

      resource.versions[version] ??= {
        isSchemasAvailable,
        uri,
        uriSchemas: undefined,
        urls: [],
        urlsGuidance: [],
        urlsNoGuidance: [],
        entriesGuidance: [],
        entriesNoGuidance: []
      };

      const displayCategory = setCategoryDisplayLabel(entry);
      let uriSchemas;

      if (isSchemasAvailable) {
        uriSchemas = `patternfly://schemas/${version}/${name}`;

        resource.versions[version].uriSchemas = uriSchemas;
      }

      const extendedEntry = { ...entry, name: docsName, displayCategory, uri, uriSchemas };

      byPath[path] = extendedEntry;

      byUri[uri] ??= [];
      byUri[uri]?.push(extendedEntry);

      if (uriSchemas) {
        byUri[uriSchemas] ??= [];
        byUri[uriSchemas]?.push(extendedEntry);
      }

      byVersion[entry.version] ??= [];
      byVersion[entry.version]?.push(extendedEntry);

      resource.urls.push(path);
      resource.versions[version].urls.push(path);

      if (extendedEntry.section === 'guidelines') {
        resource.urlsGuidance.push(path);
        resource.entriesGuidance.push(extendedEntry);
        resource.versions[version].urlsGuidance.push(path);
        resource.versions[version].entriesGuidance.push(extendedEntry);
      } else {
        resource.urlsNoGuidance.push(path);
        resource.entriesNoGuidance.push(extendedEntry);
        resource.versions[version].urlsNoGuidance.push(path);
        resource.versions[version].entriesNoGuidance.push(extendedEntry);
      }
    });

    resources.set(name, resource);
  });

  Object.entries(byVersion).forEach(([_version, entries]) => {
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  });

  return {
    ...versionContext,
    resources,
    docsIndex: Array.from(resources.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    componentsIndex: componentNamesIndex,
    keywordsIndex: Array.from(new Set([...Array.from(resources.keys()), ...componentNamesIndex]))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    pathIndex: Array.from(pathIndex).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    byPath,
    byUri,
    byVersion,
    byVersionComponentNames: componentNamesByVersion
  };
};

/**
 * Memoized version of getPatternFlyLocalDocs.
 */
getPatternFlyMcpResources.memo = memo(getPatternFlyMcpResources);

/**
 * Get the component schema from @patternfly/patternfly-component-schemas.
 *
 * @param componentName - Name of the component to retrieve the schema for.
 * @returns {Promise<PatternFlyComponentSchema|undefined>} The component schema, or `undefined` if the component name is not found.
 */
const getPatternFlyComponentSchema = async (componentName: string) => {
  const { componentNamesWithSchemasMap } = await getPatternFlyReactComponentNames.memo();

  try {
    const updatedComponentName = componentNamesWithSchemasMap[componentName.toLowerCase()];

    if (!updatedComponentName) {
      return undefined;
    }

    return await getComponentSchema(updatedComponentName);
  } catch {}

  return undefined;
};

/**
 * Memoized version of getComponentSchema.
 */
getPatternFlyComponentSchema.memo = memo(getPatternFlyComponentSchema, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

export {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources,
  getPatternFlyReactComponentNames,
  setCategoryDisplayLabel,
  type PatternFlyComponentSchema,
  type PatternFlyMcpAvailableResources,
  type PatternFlyMcpResourceMetadata,
  type PatternFlyMcpDocEntry,
  type PatternFlyMcpDocsMeta,
  type PatternFlyMcpResources,
  type PatternFlyMcpResourcesByPath,
  type PatternFlyMcpResourcesByUri,
  type PatternFlyMcpResourcesByVersion
};

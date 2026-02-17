import { componentNames as pfComponentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import patternFlyDocsCatalog from './docs.json';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { isPlainObject } from './server.helpers';
import { getPatternFlyVersionContext } from './patternFly.helpers';

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

type PatternFlyMcpDocsMeta = {
  name: string;
  displayCategory: string;
  uri: string;
  // uriSchemas?: string | undefined
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
  [path: string]: PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta;
};

/**
 * PatternFly JSON catalog by URI with an entry.
 */
// type PatternFlyMcpDocsByUri = {
//  [uri: string]: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
// };

/**
 * PatternFly JSON catalog by URI schemas with an entry.
 */
// type PatternFlyMcpDocsByUriSchemas = {
//  [uriSchemas: string]: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
// };

/**
 * PatternFly JSON catalog by version with a list of entries.
 */
type PatternFlyMcpDocsByVersion = {
  [version: string]: (PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta)[];
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
    // markdownDocsIndex: string[];
    // markdownSchemasIndex: string[];
    isSchemasAvailable: boolean;
    uri: string;
    uriSchemas: string | undefined;
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
interface PatternFlyMcpAvailableDocs {
  resources: Map<string, PatternFlyMcpResourceMetadata>;
  availableVersions: string[];
  availableSchemaVersions: string[];
  closestVersion: string;
  closestSemVer: string;
  latestVersion: string;
  nameIndex: string[];
  pathIndex: string[];
  uriIndex: string[];
  uriSchemasIndex: string[];
  byPath: PatternFlyMcpDocsByPath;
  // byUri: PatternFlyMcpDocsByUri;
  // byUriSchemas: PatternFlyMcpDocsByUriSchemas;
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
 * @note To avoid lookup issues we normalize all keys and indexes to lowercase. Component names are lowercased.
 *
 * @returns A multifaceted React component breakdown.  Use the "memoized" property for performance.
 * - `nameIndex`: Lowercase component names sorted alphabetically.
 * - `componentNamesWithSchema`: Lowercase component names sorted alphabetically.
 * - `componentNamesWithSchemaMap`: Map of lowercase component names to original case component names.
 */
const getPatternFlyReactComponentNames = () => ({
  nameIndex: Array.from(new Set([...pfComponentNames, 'Table'])).map(name => name.toLowerCase()).sort((a, b) => a.localeCompare(b)),
  componentNamesWithSchema: pfComponentNames.map(name => name.toLowerCase()).sort((a, b) => a.localeCompare(b)),
  componentNamesWithSchemaMap: new Map(pfComponentNames.map(name => [name.toLowerCase(), name]))
});

/**
 * Memoized version of getPatternFlyReactComponentNames.
 */
getPatternFlyReactComponentNames.memo = memo(getPatternFlyReactComponentNames);

/**
 * Get a multifaceted documentation breakdown from the JSON catalog.
 *
 * @param contextPathOverride - Context path for updating the returned PatternFly versions.
 * @returns A multifaceted documentation breakdown. Use the "memoized" property for performance.
 */
const getPatternFlyMcpDocs = async (contextPathOverride?: string): Promise<PatternFlyMcpAvailableDocs> => {
  const { isLatestVersion, ...versionContext } = await getPatternFlyVersionContext.memo(contextPathOverride);

  const originalDocs: PatternFlyMcpDocs = patternFlyDocsCatalog.docs;
  const resources = new Map<string, PatternFlyMcpResourceMetadata>();
  const byPath: PatternFlyMcpDocsByPath = {};
  // const byUri: PatternFlyMcpDocsByUri = {};
  // const byUriSchemas: PatternFlyMcpDocsByUriSchemas = {};
  const byVersion: PatternFlyMcpDocsByVersion = {};
  const pathIndex = new Set<string>();
  const uriIndex = new Set<string>();
  const uriSchemasIndex = new Set<string>();
  const { componentNamesWithSchema: schemaNames } = getPatternFlyReactComponentNames.memo();

  Object.entries(originalDocs).forEach(([docsName, entries]) => {
    const name = docsName.toLowerCase();
    const isSchemasAvailable = isLatestVersion && schemaNames.includes(name);
    const resource: PatternFlyMcpResourceMetadata = {
      name,
      isSchemasAvailable,
      urls: [],
      urlsNoGuidance: [],
      urlsGuidance: [],
      entriesGuidance: [],
      entriesNoGuidance: [],
      versions: {}
    };

    entries.forEach(entry => {
      const version = (entry.version || 'unknown').toLowerCase();
      const path = entry.path;
      const uri = `patternfly://docs/${version}/${name}`;

      pathIndex.add(path);
      uriIndex.add(uri);

      resource.versions[version] ??= {
        // markdownDocsIndex: [],
        // markdownSchemasIndex: [],
        isSchemasAvailable,
        uri,
        uriSchemas: undefined,
        // urisSchemas: [],
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

        uriSchemasIndex.add(uriSchemas);

        if (!uriSchemasIndex.has(uriSchemas)) {
          resource.versions[version].uriSchemas = uriSchemas;
        }

        // byUriSchemas[uriSchemas] ??= [];
        // byUriSchemas[uriSchemas]?.push({ ...entry, name: docsName, displayCategory, uri, uriSchemas });
        // markdownSchemasIndex.add(`[${docsName} (${version})](${uriSchema})`);
        // resource.versions[version].markdownSchemasIndex.push(`[${docsName} (${version})](${uriSchema})`);
      }

      byPath[path] = { ...entry, name: docsName, displayCategory, uri };

      // byUri[uri] ??= [];
      // byUri[uri].push({ ...entry, name: docsName, displayCategory, uri, uriSchemas });

      byVersion[entry.version] ??= [];
      byVersion[entry.version]?.push({ ...entry, name: docsName, displayCategory, uri });

      // pathIndex.add(path);
      // uriIndex.add(uri);

      // markdownIndex.add(`[${docsName} (${version}) - ${setCategoryDisplayLabel(entry)}](${uri})`);
      // resource.versions[version].markdownDocsIndex.push(`[${docsName} (${version}) - ${setCategoryDisplayLabel(entry)}](${uri})`);

      // if (!uriIndex.has(uri)) {
      //  uriIndex.add(uri);
      // resource.versions[version].uris.push(uri);
      // }

      resource.urls.push(path);
      resource.versions[version].urls.push(path);

      if (entry.section === 'guidelines') {
        resource.urlsGuidance.push(path);
        resource.entriesGuidance.push(entry);
        resource.versions[version].urlsGuidance.push(path);
        resource.versions[version].entriesGuidance.push(entry);
      } else {
        resource.urlsNoGuidance.push(path);
        resource.entriesNoGuidance.push(entry);
        resource.versions[version].urlsNoGuidance.push(path);
        resource.versions[version].entriesNoGuidance.push(entry);
      }
    });

    resources.set(name, resource);
  });

  Object.entries(byVersion).forEach(([_version, entries]) => {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  });

  return {
    ...versionContext,
    resources,
    // markdownIndex: Array.from(markdownIndex).sort((a, b) => a.localeCompare(b)),
    // markdownSchemasIndex: Array.from(markdownSchemasIndex).sort((a, b) => a.localeCompare(b)),
    nameIndex: Array.from(resources.keys()).sort((a, b) => a.localeCompare(b)),
    pathIndex: Array.from(pathIndex).sort((a, b) => a.localeCompare(b)),
    uriIndex: Array.from(uriIndex).sort((a, b) => a.localeCompare(b)),
    uriSchemasIndex: Array.from(uriSchemasIndex).sort((a, b) => a.localeCompare(b)),
    byPath,
    // byUri,
    // byUriSchemas,
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
  const { componentNamesWithSchemaMap } = getPatternFlyReactComponentNames.memo();

  try {
    const updatedComponentName = componentNamesWithSchemaMap.get(componentName.toLowerCase());

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
  getPatternFlyMcpDocs,
  getPatternFlyReactComponentNames,
  setCategoryDisplayLabel,
  type PatternFlyComponentSchema,
  type PatternFlyMcpAvailableDocs,
  type PatternFlyMcpResourceMetadata,
  type PatternFlyMcpDocEntry,
  type PatternFlyMcpDocsMeta,
  type PatternFlyMcpDocs,
  type PatternFlyMcpDocsByPath,
  // type PatternFlyMcpDocsByUri,
  // type PatternFlyMcpDocsByUriSchemas,
  type PatternFlyMcpDocsByVersion
};

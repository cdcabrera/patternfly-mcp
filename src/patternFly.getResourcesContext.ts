import {
  componentNames as pfComponentNames,
  getComponentSchema
} from '@patternfly/patternfly-component-schemas/json';
import { memo } from './server.caching';
import { generateHash } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyVersionContext
} from './patternFly.helpers';
import { log, formatUnknownError } from './logger';
import {
  EMBEDDED_DOCS,
  type PatternFlyMcpDocsCatalog,
  // type PatternFlyMcpDocsCatalogEntry,
  type PatternFlyMcpDocsCatalogDoc
} from './docs.embedded';
// import { COLLECTIONS, type Collection } from './docs.collections';

/**
 * Derive the component schema type from @patternfly/patternfly-component-schemas
 */
type PatternFlyComponentSchema = Awaited<ReturnType<typeof getPatternFlyComponentSchema>>;

/**
 * Map of PatternFly component names to their versioned metadata.
 *
 * Properties for each component include:
 * - `isSchemasAvailable`: Boolean indicating whether schemas are available for the component.
 * - `displayName`: String that defines the human-readable name of the component.
 */
type PatternFlyMcpComponentNamesByVersion = {
  [name: string]: {
    isSchemasAvailable: boolean;
    displayName: string;
  }
};

/**
 * Documentation structure for PatternFly MCP component names. Intended to help
 * merge with existing documents catalog.
 *
 * Unique Properties:
 * - `path`: Non-existent, omitted from the base catalog documentation type.
 * - `isSchemasAvailable`: A boolean flag that indicates whether schemas are available for the component.
 */
type PatternFlyMcpComponentNamesDoc = Omit<PatternFlyMcpDocsCatalogDoc, 'path'> & { path?: never; isSchemasAvailable: boolean };

/**
 * Component names metadata.
 *
 * @interface PatternFlyMcpComponentNames
 *
 * @property componentNamesIndex - Component names index.
 * @property componentNamesIndexMap - Component names index map.
 * @property byVersion - Component names by version map.
 * @property byDocs - Component names by docs map.
 * @property byLatestVersion - Component names by latest version map.
 */
interface PatternFlyMcpComponentNames {
  componentNamesIndex: string[];
  componentNamesIndexMap: Map<string, string>;
  byVersion: Map<string, PatternFlyMcpComponentNamesByVersion>;
  byDocs: Map<string, PatternFlyMcpComponentNamesDoc[]>;
  byLatestVersion?: PatternFlyMcpComponentNamesByVersion | undefined;
}

/**
 * Record for mapping a hash to a human-readable metadata.
 */
type ContextManagementPatternFlyHashRecord = {
  id: string;
  uri: string;
  // uri?: string;
  // componentUri?: string;
  collectionIds: string[];
  name: string;
  version: string;
  category: string;
  section: string;
  displayName: string;
  displayCategory: string;
  description: string;
  path?: string | undefined;
  // isCollection: boolean;
  // isSchemasAvailable: boolean;
  searchString: string;
  seriesName: string;
  seriesDisplayName: string;
};

type ContextManagementCollectionRecord = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  uri: string;
};

/**
 * Lean available resources for context management.
 *
 * @property collectionsIndex - Collections index. A collection ID to collection metadata lookup.
 * @property collectionsIdIndex - Collections id index. Use a collection ID to retrieve all records associated with a specific collection.
 * @property nameIndex - Name index. A record name to record ID lookup. Get all available record IDs associated with a name.
 * @property pathIndex - Path index.
 * @property idIndex - Id index. A record ID to record lookup
 * @property recordsList - Records list.
 * @property latestVersion - Latest version. Latest available PF version.
 * @property availableVersions - Available versions. All available PF versions.
 */
type ContextManagementResources = {
  collectionsIndex: Map<string, ContextManagementCollectionRecord>;
  collectionsIdIndex: Map<string, ContextManagementPatternFlyHashRecord[]>;
  nameIndex: Map<string, string[]>;
  pathIndex: Map<string, string>;
  idIndex: Map<string, ContextManagementPatternFlyHashRecord>;
  recordsList: ContextManagementPatternFlyHashRecord[];
  latestVersion: string;
  availableVersions: string[];
};

/**
 * Lazy load the PatternFly documentation catalog.
 *
 * @returns PatternFly documentation catalog JSON, or fallback catalog if import fails.
 */
const getPatternFlyDocsCatalog = async (): Promise<PatternFlyMcpDocsCatalog & { isFallback: boolean }> => {
  let docsCatalog = EMBEDDED_DOCS;
  let isFallback = false;

  try {
    if (process.env.NODE_ENV === 'local') {
      docsCatalog = (await import('./docs.json', { with: { type: 'json' } })).default;
    } else {
      docsCatalog = (await import('#docsCatalog', { with: { type: 'json' } })).default;
    }
  } catch (error) {
    isFallback = true;
    log.debug(`Failed to import docs catalog '#docsCatalog': ${formatUnknownError(error)}`, 'Using fallback docs catalog.');
  }

  return { ...docsCatalog, isFallback };
};

/**
 * Memoized version of getPatternFlyDocsCatalog.
 */
getPatternFlyDocsCatalog.memo = memo(getPatternFlyDocsCatalog);

/**
 * Set the category display label based on the records' section and category.
 *
 * @note Review integrating locale strings with some level of display logic.
 *
 * @param record - PatternFly documentation record
 * @returns The category display label
 */
const setCategoryDisplayLabel = (record?: PatternFlyMcpDocsCatalogDoc) => {
  let categoryLabel = typeof record?.category === 'string' ? record.category.trim().toLowerCase() : undefined;

  if (categoryLabel === undefined) {
    return 'Documentation';
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

  return record?.section?.trim()?.toLowerCase() === 'guidelines' ? 'AI Guidance' : categoryLabel;
};

/**
 * A multifaceted list of all PatternFly React component names.
 *
 * @note Consider iterating over the components by version using the "availableVersions" array
 * from getPatternFlyVersionContext.
 *
 * @note The "table" component is manually added to the `componentNamesIndex` list because it's not currently included
 * in the component schemas v6 package.
 *
 * @note To avoid lookup issues we normalize all keys and indexes to lowercase. Component names are lowercased.
 *
 * @param contextPathOverride - Context path for updating the returned PatternFly versions.
 * @returns A multifaceted React component breakdown.  Use the "memoized" property for performance.
 * - `componentNamesIndex`: ALL component names across ALL versions,
 * - `componentNamesIndexMap`: Map of lowercase ALL component names to original case component names,
 * - `byVersion`: Map of lowercase PatternFly versions to Map of lowercase component names to { isSchemasAvailable: boolean, displayName: string }
 */
const getPatternFlyComponentNames = async (contextPathOverride?: string): Promise<PatternFlyMcpComponentNames> => {
  const { latestSchemasVersion } = await getPatternFlyVersionContext.memo(contextPathOverride);

  const latestNamesIndex = [...Array.from(new Set([...pfComponentNames, 'Table'])).map(name => name.toLowerCase()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  const latestNamesIndexMap = new Map(Array.from(new Set([...pfComponentNames, 'Table'])).map(name => [name.toLowerCase(), name]));
  const latestByNameMap = new Map<string, { isSchemasAvailable: boolean, displayName: string }>();
  const latestByDocsFormat = new Map<string, PatternFlyMcpComponentNamesDoc[]>();
  const createDocEntry = (name: string, isSchemasAvailable: boolean) => ({
    displayName: name,
    description: `PatternFly React component: ${name}`,
    pathSlug: `schemas-${name}`.toLowerCase(),
    category: 'react',
    section: 'components',
    source: 'schemas',
    version: latestSchemasVersion,
    isSchemasAvailable
  });

  pfComponentNames.forEach(name => {
    latestByNameMap.set(name.toLowerCase(), { isSchemasAvailable: true, displayName: name });
    latestByDocsFormat.set(name.toLowerCase(), [createDocEntry(name, true)]);
  });

  const byVersion: PatternFlyMcpComponentNames['byVersion'] = new Map();

  latestByNameMap.set('table', { isSchemasAvailable: false, displayName: 'Table' });
  latestByDocsFormat.set('table', [createDocEntry('Table', false)]);
  const convert = Object.fromEntries(latestByNameMap);

  byVersion.set(
    latestSchemasVersion,
    convert
  );

  return {
    componentNamesIndex: latestNamesIndex,
    componentNamesIndexMap: latestNamesIndexMap,
    byVersion,
    byDocs: latestByDocsFormat,
    byLatestVersion: byVersion.get(latestSchemasVersion) || undefined
  };
};

/**
 * Memoized version of getPatternFlyReactComponentNames.
 */
getPatternFlyComponentNames.memo = memo(getPatternFlyComponentNames);

// Work Collection metadata from "docs.collections" into this. Change to simple match Though AND need a fallback for lack of collection metadata.
const setCollectionDisplayLabel = (values: string[]) => (
  {
    name: values.join(' - '),
    displayName: values.join(' - '),
    description: values.join(' - ')
  }
);

const getPatternFlyContextManagementResources = async (
  contextPathOverride?: string
): Promise<ContextManagementResources> => {
  const versionContext = await getPatternFlyVersionContext.memo(contextPathOverride);
  const componentNames = await getPatternFlyComponentNames.memo(contextPathOverride);
  const { byDocs: componentNamesByDocs } = componentNames;
  const originalDocs = await getPatternFlyDocsCatalog.memo();

  // const collectionsIndex = patternFlyContextCollections.memo();
  const hashIndex = new Map<string, ContextManagementPatternFlyHashRecord>();
  const nameIndex = new Map<string, string[]>();
  const pathIndex = new Map<string, string>();
  const versionIndex: ContextManagementPatternFlyHashRecord[] = [];

  // ID to Records Array
  const collectionsIdIndex = new Map<string, ContextManagementPatternFlyHashRecord[]>();
  // ID to collection metadata
  const collectionsIndex = new Map<string, ContextManagementCollectionRecord>();

  const recordsMap = new Map<string, (PatternFlyMcpDocsCatalogDoc | PatternFlyMcpComponentNamesDoc)[]>();

  // Merging docs from both sources. We lowercase name keys for deduplication.
  Object.entries(originalDocs.docs).forEach(([name, entries]) => {
    recordsMap.set(name.toLowerCase(), [...entries]);
  });

  for (const [name, records] of componentNamesByDocs) {
    const lowerName = name.toLowerCase();
    const existing = recordsMap.get(lowerName) || [];

    recordsMap.set(lowerName, [...existing, ...records]);
  }

  for (const [name, records] of recordsMap) {
    const groupCollectionId = generateHash(name).toLowerCase();
    const groupName = name;
    const groupDisplayName = groupName.charAt(0).toUpperCase() + groupName.slice(1);

    records.forEach(record => {
      const recordId = generateHash(record.path || `${groupName}:${record.version}:${record.section}:${record.category}:${record.pathSlug}:${record.source}`.toLowerCase());
      // const isSchemasAvailable = versionContext.latestSchemasVersion === version && componentNamesByVersion.get(version)?.[name]?.isSchemasAvailable;
      const recordVersion = (record.version || 'unknown').toLowerCase();
      const recordDisplayName = record.displayName || groupDisplayName;
      const recordDisplayCategory = setCategoryDisplayLabel(record as PatternFlyMcpDocsCatalogDoc);
      const recordSection = record.section.toLowerCase();
      const recordCategory = record.category.toLowerCase();
      const recordDescription = record.description || '';

      const recordCollectionSectionValue = [record.section];
      const recordCollectionSectionId = generateHash(`${recordCollectionSectionValue.join(':')}`);

      const recordCollectionCategoryValue = [record.category];
      const recordCollectionCategoryId = generateHash(`${recordCollectionCategoryValue.join(':')}`);

      const recordCollectionValue = [record.section, record.category];
      const recordCollectionId = generateHash(`${recordCollectionValue.join(':')}`);
      const recordCollectionIds = [groupCollectionId, recordCollectionSectionId, recordCollectionCategoryId, recordCollectionId];

      const normalizedRecord: ContextManagementPatternFlyHashRecord = {
        id: recordId,
        // uri: `patternfly://{uriType}/${recordId}`
        uri: `patternfly://docs/${recordId}`,
        // componentUri,
        collectionIds: recordCollectionIds,
        // collectionUris: recordCollectionIds.map(id => `patternfly://collections/${id}`),
        // collectionDisplayNames: recordCollectionDisplayNames,
        name: recordDisplayName.toLowerCase(),
        seriesName: groupName,
        seriesDisplayName: groupDisplayName,
        version: recordVersion,
        category: recordCategory,
        section: recordSection,
        displayName: recordDisplayName,
        displayCategory: recordDisplayCategory,
        description: recordDescription,
        path: record.path || undefined,
        // isSchemasAvailable: Boolean(isSchemasAvailable),
        searchString: `${groupName} ${recordDisplayName} ${recordDescription}`.toLowerCase()
      };

      // ContextManagementCollectionRecord
      if (!collectionsIdIndex.has(groupCollectionId)) {
        collectionsIdIndex.set(groupCollectionId, [normalizedRecord]);

        collectionsIndex.set(groupCollectionId, {
          id: groupCollectionId,
          name: groupName,
          displayName: groupDisplayName,
          description: `Series of ${groupDisplayName}.`,
          uri: `patternfly://collection/${groupCollectionId}`
        });
      } else {
        collectionsIdIndex.get(groupCollectionId)?.push(normalizedRecord);
      }

      if (!collectionsIdIndex.has(recordCollectionSectionId)) {
        collectionsIdIndex.set(recordCollectionSectionId, [normalizedRecord]);

        collectionsIndex.set(recordCollectionSectionId, {
          ...setCollectionDisplayLabel(recordCollectionSectionValue),
          id: recordCollectionSectionId,
          uri: `patternfly://collection/${recordCollectionSectionId}`
        });
      } else {
        collectionsIdIndex.get(recordCollectionSectionId)?.push(normalizedRecord);
      }

      if (!collectionsIdIndex.has(recordCollectionCategoryId)) {
        collectionsIdIndex.set(recordCollectionCategoryId, [normalizedRecord]);

        collectionsIndex.set(recordCollectionCategoryId, {
          ...setCollectionDisplayLabel(recordCollectionCategoryValue),
          id: recordCollectionCategoryId,
          uri: `patternfly://collection/${recordCollectionCategoryId}`
        });
      } else {
        collectionsIdIndex.get(recordCollectionCategoryId)?.push(normalizedRecord);
      }

      if (!collectionsIdIndex.has(recordCollectionId)) {
        collectionsIdIndex.set(recordCollectionId, [normalizedRecord]);

        collectionsIndex.set(recordCollectionId, {
          ...setCollectionDisplayLabel(recordCollectionValue),
          id: recordCollectionId,
          uri: `patternfly://collection/${recordCollectionId}`
        });
      } else {
        collectionsIdIndex.get(recordCollectionId)?.push(normalizedRecord);
      }

      hashIndex.set(normalizedRecord.id, normalizedRecord);

      normalizedRecord.collectionIds.forEach(collectionId => {
        if (collectionsIdIndex.has(collectionId)) {
          // collectionsIdIndex.get(collectionId)?.push(normalizedRecord.id);
          collectionsIdIndex.get(collectionId)?.push(normalizedRecord);
        } else {
          // collectionsIdIndex.set(collectionId, [normalizedRecord.id]);
          collectionsIdIndex.set(collectionId, [normalizedRecord]);
        }
      });

      if (!nameIndex.has(name)) {
        nameIndex.set(name, []);
      }

      nameIndex.get(name)?.push(recordId);
      // nameIndex.get(name)?.push(normalizedRecord);

      if (normalizedRecord.path) {
        pathIndex.set(normalizedRecord.path.toLowerCase(), recordId);
      }

      versionIndex.push(normalizedRecord);
    });
  }

  // Sort versionIndex: version (desc), name (asc)
  versionIndex.sort((a, b) => {
    const versionCompare = b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });

    if (versionCompare !== 0) {
      return versionCompare;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return {
    idIndex: hashIndex,
    collectionsIdIndex,
    collectionsIndex,
    nameIndex,
    pathIndex,
    recordsList: versionIndex,
    latestVersion: versionContext.latestVersion,
    availableVersions: versionContext.availableVersions
  };
};

/**
 * Memoized version of getPatternFlyContextManagementResources.
 */
getPatternFlyContextManagementResources.memo = memo(getPatternFlyContextManagementResources);

/**
 * Get the component schema from @patternfly/patternfly-component-schemas.
 *
 * @param componentName - Name of the component to retrieve the schema for.
 * @returns The component schema, or `undefined` if the component name is not found.
 */
const getPatternFlyComponentSchema = async (componentName: string) => {
  const { byLatestVersion } = await getPatternFlyComponentNames.memo();

  try {
    const updatedComponentName = byLatestVersion?.[componentName.toLowerCase()]?.displayName;

    if (!updatedComponentName) {
      return undefined;
    }

    return await getComponentSchema(updatedComponentName);
  } catch (error) {
    log.debug(`Failed to get component schemas for "${componentName}": ${formatUnknownError(error)}`);
  }

  return undefined;
};

/**
 * Memoized version of getPatternFlyComponentSchema.
 */
getPatternFlyComponentSchema.memo = memo(getPatternFlyComponentSchema, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

export {
  getPatternFlyComponentSchema,
  getPatternFlyContextManagementResources,
  getPatternFlyComponentNames,
  setCategoryDisplayLabel,
  type PatternFlyMcpComponentNames,
  type PatternFlyMcpComponentNamesByVersion,
  type PatternFlyMcpComponentNamesDoc,
  type PatternFlyComponentSchema,
  type ContextManagementPatternFlyHashRecord,
  type ContextManagementResources
};

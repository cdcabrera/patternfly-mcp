import {
  componentNames as pfComponentNames,
  getComponentSchema
} from '@patternfly/patternfly-component-schemas/json';
import { memo } from './server.caching';
import { generateHash, listIncrementalCombinations } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyVersionContext
} from './patternFly.helpers';
import { log, formatUnknownError } from './logger';
import {
  EMBEDDED_DOCS,
  type PatternFlyMcpDocsCatalog,
  type PatternFlyMcpDocsCatalogDoc
} from './docs.embedded';
import { COLLECTIONS, type Collection } from './docs.collections';

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

type ContextManagementRecordLookup = {
  isComponent: boolean;
  // isSchemasAvailable: boolean;
  [key: string]: unknown
};

/**
 * Record for mapping a hash to metadata.
 */
type ContextManagementPatternFlyIdRecord = {
  id: string;
  recordType: 'record';
  uri: string;
  collectionIds: string[];
  name: string;
  version: string;
  category: string;
  section: string;
  displayName: string;
  displayCategory: string;
  description: string;
  path?: string | undefined;
  searchString: string;
  seriesId: string;
  seriesName: string;
  seriesDisplayName: string;
  lookup: (id?: string) => ContextManagementRecordLookup;
};

/**
 * Record for PatternFly Collections (Hubs).
 */
type ContextManagementCollectionRecord = {
  id: string;
  recordType: 'collection';
  name: string;
  displayName: string;
  description: string;
  uri: string;
  searchString: string; // Enables collection discovery via fuzzy search
};

/*
type ContextManagementCollectionLookup = {
  collection: ContextManagementCollectionRecord | undefined;
  [key: string]: unknown
};
 */

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
  collectionsIdIndex: Map<string, ContextManagementPatternFlyIdRecord[]>;
  // collectionsLookup: (id: string) => ContextManagementCollectionLookup;
  nameIndex: Map<string, string[]>;
  pathIndex: Map<string, string>;
  idIndex: Map<string, ContextManagementPatternFlyIdRecord>;
  recordsList: ContextManagementPatternFlyIdRecord[];
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
// const setCategoryDisplayLabel = (record?: PatternFlyMcpDocsCatalogDoc | PatternFlyMcpComponentNamesDoc) => {
const setCategoryDisplayLabel = (record: Record<string, unknown>) => {
  const updatedCategory = (record.category as string)?.trim()?.toLowerCase() || undefined;

  if (updatedCategory === undefined) {
    return 'Documentation';
  }

  let categoryLabel = updatedCategory;

  switch (updatedCategory) {
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

  const updatedSection = (record.section as string)?.trim()?.toLowerCase();

  if (updatedCategory === 'react' && updatedSection === 'components') {
    return record.isSchemasAvailable ? 'Component Specs' : 'Component Overview';
  }

  if (updatedSection === 'guidelines') {
    return 'AI Guidance';
  }

  return categoryLabel;
};

/**
 * A multifaceted list of all PatternFly React component names.
 *
 * @param contextPathOverride
 */
const getPatternFlyComponentNames = async (contextPathOverride?: string): Promise<PatternFlyMcpComponentNames> => {
  const { latestSchemasVersion } = await getPatternFlyVersionContext.memo(contextPathOverride);
  const names = Array.from(new Set([...pfComponentNames, 'Table']));
  const latestNamesIndex = names.map(name => name.toLowerCase()).sort();
  const latestNamesIndexMap = new Map(names.map(name => [name.toLowerCase(), name]));
  const latestByDocsFormat = new Map<string, PatternFlyMcpComponentNamesDoc[]>();

  names.forEach(name => {
    const isSchemasAvailable = name !== 'Table';
    let description = `Component React reference for ${name}.`;

    if (isSchemasAvailable) {
      description = `Component React reference and JSON schema for ${name}.`;
    }

    latestByDocsFormat.set(name.toLowerCase(), [{
      displayName: name,
      description,
      pathSlug: `schemas-${name}`.toLowerCase(),
      category: 'react',
      section: 'components',
      source: 'schemas',
      version: latestSchemasVersion,
      isSchemasAvailable: name !== 'Table'
    }]);
  });

  const byVersion = new Map<string, Record<string, { isSchemasAvailable: boolean, displayName: string }>>();

  byVersion.set(
    latestSchemasVersion,
    Object.fromEntries(
      names.map(name => [name.toLowerCase(), { isSchemasAvailable: name !== 'Table', displayName: name }])
    )
  );

  return {
    componentNamesIndex: latestNamesIndex,
    componentNamesIndexMap: latestNamesIndexMap,
    byVersion,
    byDocs: latestByDocsFormat,
    byLatestVersion: byVersion.get(latestSchemasVersion)
  };
};

/**
 * Memoized version of getPatternFlyReactComponentNames.
 */
getPatternFlyComponentNames.memo = memo(getPatternFlyComponentNames);

/**
 * Retrieve a lookup object associated with records.
 *
 * Combines metadata with additional information derived from the provided input parameters.
 *
 * @param params - Input parameters.
 * @param params.id - Identifier for locating a specific collection.
 * @param params.record - The record containing context management information.
 * @param params.collections - Map of collection records, keyed by string identifiers.
 * @param params.metadata - Metadata to be included in the lookup object.
 *
 * @returns A lookup object that can include metadata, collection data, and a flag
 * indicating if the target is a React component within the "components" section.
 */
const getPatternFlyContextManagementLookup = (
  {
    id, record, collections, metadata
  }:{ id: string | undefined; record: ContextManagementPatternFlyIdRecord; collections: Map<string, ContextManagementCollectionRecord>, metadata: Record<string, unknown> }
): ContextManagementRecordLookup => ({
  ...metadata,
  collection: (id && collections?.get(id)) || undefined,
  isComponent: record.category === 'react' && record.section === 'components'
});

/**
 * Generate collection metadata from configuration or record metadata.
 *
 * @param values - Array of string values to derive collection label from.
 * @param record - Record containing metadata for the PatternFly resource.
 * @param options - Optional configuration options.
 * @param options.collections - Custom collection configuration to use instead of default.
 */
const setCollectionDisplayLabel = (
  values: string[],
  record: ContextManagementPatternFlyIdRecord,
  { collections = COLLECTIONS }: { collections?: Collection[] } = {}
) => {
  // Try to find a match to `collections` config
  const match = collections.find(collection => Object.entries(collection.matches).every(([key, matchValues]) => {
    const recordValue = String(record[key as keyof ContextManagementPatternFlyIdRecord] || '').toLowerCase();
    const matchArray = Array.isArray(matchValues)
      ? matchValues.map(value => String(value).toLowerCase())
      : [String(matchValues).toLowerCase()];

    return matchArray.includes(recordValue);
  }));

  if (match) {
    return {
      name: match.name,
      displayName: match.displayName,
      description: match.description,
      searchString: `${match.name} ${match.displayName} ${match.description}`.toLowerCase()
    };
  }

  // Fallback to dynamic generation if no config match is found, typically for groups/series.
  const label = values.map(value => value.charAt(0).toUpperCase() + value.slice(1)).join(' - ');

  return {
    name: label,
    displayName: label,
    description: `Series of resources under "${label}."`,
    searchString: values.join(' ').toLowerCase()
  };
};

/**
 * Core Resource Discovery Engine
 *
 * @param contextPathOverride
 * @param options - Optional configuration options.
 * @param [options.collectionProps] - Collection properties to include in the resource discovery
 * @returns Context management resources.
 */
const getPatternFlyContextManagementResources = async (
  contextPathOverride?: string, { collectionProps = ['section', 'category', 'source'] }: { collectionProps?: string[] } = {}
): Promise<ContextManagementResources> => {
  const versionContext = await getPatternFlyVersionContext.memo(contextPathOverride);
  const componentNames = await getPatternFlyComponentNames.memo(contextPathOverride);
  const originalDocs = await getPatternFlyDocsCatalog.memo();

  const hashIndex = new Map<string, ContextManagementPatternFlyIdRecord>();
  const nameIndex = new Map<string, string[]>();
  const pathIndex = new Map<string, string>();
  const collectionsIdIndex = new Map<string, ContextManagementPatternFlyIdRecord[]>();
  const collectionsIndex = new Map<string, ContextManagementCollectionRecord>();
  const recordsList: ContextManagementPatternFlyIdRecord[] = [];

  const recordsMap = new Map<string, (PatternFlyMcpDocsCatalogDoc | PatternFlyMcpComponentNamesDoc)[]>();

  Object.entries(originalDocs.docs).forEach(([name, entries]) => recordsMap.set(name.toLowerCase(), [...entries]));

  for (const [name, records] of componentNames.byDocs) {
    const existing = recordsMap.get(name.toLowerCase()) || [];

    recordsMap.set(name.toLowerCase(), [...existing, ...records]);
  }

  for (const [name, records] of recordsMap) {
    const groupName = name;
    const groupDisplayName = groupName.charAt(0).toUpperCase() + groupName.slice(1);
    const groupCollectionId = generateHash(groupName).toLowerCase();

    records.forEach(record => {
      // Reserve for extras that are challenging to duck-type, used via `record.lookup()`
      const isSchemasAvailable = componentNames.byVersion.get(record.version)?.[name]?.isSchemasAvailable || false;
      const metadata: Record<string, unknown> = {
        isSchemasAvailable
      };

      const recordId = generateHash(record.path || `${groupName}:${record.version}:${record.section}:${record.category}:${record.pathSlug}:${record.source}`.toLowerCase());
      const recordVersion = (record.version || 'unknown').toLowerCase();
      const recordDisplayName = record.displayName || groupDisplayName;
      const recordSection = record.section.toLowerCase();
      const recordCategory = record.category.toLowerCase();
      const recordDescription = record.description || '';

      // Collect collection values
      const rawCollectionValues = Object.entries(record)
        .filter(([key, _value]) => collectionProps.includes(key))
        .map(([_key, value]) => String(value).toLowerCase());

      const combinations = listIncrementalCombinations(rawCollectionValues).filter(arr => arr.length > 0);

      // Always set a series ID is always first
      const recordCollectionIds = [groupCollectionId];
      const recordCollectionIndex = new Map<string, string[]>();

      recordCollectionIndex.set(groupCollectionId, [groupName]);

      // Set generated collection IDs
      combinations.forEach(combo => {
        const id = generateHash(combo.join(':')).toLowerCase();

        recordCollectionIds.push(id);
        recordCollectionIndex.set(id, combo);
      });

      const normalizedRecord: ContextManagementPatternFlyIdRecord = {
        id: recordId,
        recordType: 'record',
        uri: `patternfly://records/${recordId}`,
        collectionIds: [...new Set(recordCollectionIds)],
        name: recordDisplayName.toLowerCase(),
        seriesId: groupCollectionId,
        seriesName: groupName,
        seriesDisplayName: groupDisplayName,
        version: recordVersion,
        category: recordCategory,
        section: recordSection,
        displayName: recordDisplayName,
        displayCategory: setCategoryDisplayLabel({ ...record, isSchemasAvailable }),
        description: recordDescription,
        path: record.path || undefined,
        searchString: `${groupName} ${recordDisplayName} ${recordDescription}`.toLowerCase(),
        lookup: id =>
          getPatternFlyContextManagementLookup({ id, record: normalizedRecord, collections: collectionsIndex, metadata })
      };

      // Indexing
      hashIndex.set(recordId, normalizedRecord);

      if (!nameIndex.has(groupName)) {
        nameIndex.set(groupName, []);
      }

      nameIndex.get(groupName)?.push(recordId);

      if (normalizedRecord.path) {
        pathIndex.set(normalizedRecord.path.toLowerCase(), recordId);
      }
      recordsList.push(normalizedRecord);

      // Create collection metadata if it doesn't exist. Map records to collection IDs.
      recordCollectionIds.forEach(id => {
        if (!collectionsIdIndex.has(id)) {
          collectionsIndex.set(id, {
            ...setCollectionDisplayLabel(recordCollectionIndex.get(id) || [], normalizedRecord),
            id,
            recordType: 'collection',
            uri: `patternfly://collections/${id}`
          });
        }

        collectionsIdIndex.get(id)?.push(normalizedRecord);
      });
    });
  }

  recordsList.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  return {
    idIndex: hashIndex,
    collectionsIdIndex,
    collectionsIndex,
    nameIndex,
    pathIndex,
    recordsList,
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
    const updatedName = byLatestVersion?.[componentName.toLowerCase()]?.displayName;

    if (updatedName) {
      return await getComponentSchema(updatedName);
    }
  } catch (error) {
    log.debug(`Failed to get component schema for "${componentName}": ${formatUnknownError(error)}`);
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
  type ContextManagementPatternFlyIdRecord,
  type ContextManagementResources,
  type ContextManagementCollectionRecord
};

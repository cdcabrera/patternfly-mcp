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
  type PatternFlyMcpDocsCatalogDoc
} from './docs.embedded';

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
 * Record for mapping a hash to metadata.
 */
type ContextManagementPatternFlyHashRecord = {
  id: string;
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
  seriesName: string;
  seriesDisplayName: string;
};

/**
 * Record for PatternFly Collections (Hubs).
 */
type ContextManagementCollectionRecord = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  uri: string;
  searchString: string; // Enables collection discovery via fuzzy search
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
 * @param contextPathOverride
 */
const getPatternFlyComponentNames = async (contextPathOverride?: string): Promise<PatternFlyMcpComponentNames> => {
  const { latestSchemasVersion } = await getPatternFlyVersionContext.memo(contextPathOverride);
  const names = Array.from(new Set([...pfComponentNames, 'Table']));
  const latestNamesIndex = names.map(name => name.toLowerCase()).sort();
  const latestNamesIndexMap = new Map(names.map(name => [name.toLowerCase(), name]));
  const latestByDocsFormat = new Map<string, PatternFlyMcpComponentNamesDoc[]>();

  names.forEach(name => {
    latestByDocsFormat.set(name.toLowerCase(), [{
      displayName: name,
      description: `PatternFly React component: ${name}`,
      pathSlug: `schemas-${name}`.toLowerCase(),
      category: 'react',
      section: 'components',
      source: 'schemas',
      version: latestSchemasVersion,
      isSchemasAvailable: name !== 'Table'
    }]);
  });

  const byVersion = new Map();

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
 * Temporary collection metadata. Review adding in something like setCategoryDisplayLabel or the `docs.collections` data.
 *
 * @param values
 */
const setCollectionDisplayLabel = (values: string[]) => (
  {
    name: values.join(' - '),
    displayName: values.join(' - '),
    description: `Series of ${values.join(' - ')}`,
    searchString: values.join(' ').toLowerCase()
  }
);

/**
 * Core Resource Discovery Engine
 *
 * @param contextPathOverride
 */
const getPatternFlyContextManagementResources = async (contextPathOverride?: string): Promise<ContextManagementResources> => {
  const versionContext = await getPatternFlyVersionContext.memo(contextPathOverride);
  const componentNames = await getPatternFlyComponentNames.memo(contextPathOverride);
  const originalDocs = await getPatternFlyDocsCatalog.memo();

  const hashIndex = new Map<string, ContextManagementPatternFlyHashRecord>();
  const nameIndex = new Map<string, string[]>();
  const pathIndex = new Map<string, string>();
  const collectionsIdIndex = new Map<string, ContextManagementPatternFlyHashRecord[]>();
  const collectionsIndex = new Map<string, ContextManagementCollectionRecord>();
  const recordsList: ContextManagementPatternFlyHashRecord[] = [];

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
      const recordId = generateHash(record.path || `${groupName}:${record.version}:${record.section}:${record.category}:${record.pathSlug}:${record.source}`.toLowerCase());
      // const isSchemasAvailable = versionContext.latestSchemasVersion === version && componentNamesByVersion.get(version)?.[name]?.isSchemasAvailable;
      const recordVersion = (record.version || 'unknown').toLowerCase();
      const recordDisplayName = record.displayName || groupDisplayName;
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

      const recordCollectionIndex = new Map<string, string[]>();

      recordCollectionIndex.set(groupCollectionId, [groupName]);
      recordCollectionIndex.set(recordCollectionSectionId, recordCollectionSectionValue);
      recordCollectionIndex.set(recordCollectionCategoryId, recordCollectionCategoryValue);
      recordCollectionIndex.set(recordCollectionId, recordCollectionValue);

      const normalizedRecord: ContextManagementPatternFlyHashRecord = {
        id: recordId,
        uri: `patternfly://docs/${recordId}`,
        collectionIds: recordCollectionIds,
        name: recordDisplayName.toLowerCase(),
        seriesName: groupName,
        seriesDisplayName: groupDisplayName,
        version: recordVersion,
        category: recordCategory,
        section: recordSection,
        displayName: recordDisplayName,
        displayCategory: setCategoryDisplayLabel(record as PatternFlyMcpDocsCatalogDoc),
        description: recordDescription,
        path: record.path || undefined,
        // isSchemasAvailable: Boolean(isSchemasAvailable),
        searchString: `${groupName} ${recordDisplayName} ${recordDescription}`.toLowerCase()
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

      // Collection Indexing
      if (!collectionsIndex.has(groupCollectionId)) {
        collectionsIndex.set(groupCollectionId, {
          id: groupCollectionId,
          name: groupName,
          displayName: groupDisplayName,
          description: `Series of ${groupDisplayName}.`,
          uri: `patternfly://collection/${groupCollectionId}`,
          searchString: `${groupName} ${groupDisplayName} series`.toLowerCase()
        });
      }

      recordCollectionIds.forEach(id => {
        if (!collectionsIdIndex.has(id)) {
          collectionsIdIndex.set(id, []);

          if (recordCollectionIndex.has(id)) {
            collectionsIndex.set(id, {
              ...setCollectionDisplayLabel(recordCollectionIndex.get(id) as string[]),
              id,
              uri: `patternfly://collection/${id}`
            });
          }
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
  type ContextManagementPatternFlyHashRecord,
  type ContextManagementResources
};

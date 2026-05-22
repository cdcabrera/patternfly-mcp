import { filterPatternFly, type FilterPatternFlyFilters } from './patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import {
  getPatternFlyMcpResources,
  getPatternFlyComponentSchema
} from './patternFly.getResources';
import { processDocsFunction } from './server.getResources';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions } from './options.context';
import { buildSearchString } from './server.helpers';

/**
 * Shared logic for normalizing versions and validating inputs.
 *
 * @param {FilterPatternFlyFilters & { isSchema?: boolean }} params - The filters to prepare.
 * @param {object} [options] - Global options.
 * @returns {Promise<object>} The prepared resolution.
 */
const prepareResolution = async (params: FilterPatternFlyFilters & { isSchema?: boolean }, options = getOptions()) => {
  const { version, category, section, isSchema } = params;

  if (version) {
    assertInputStringLength(version, { ...options.minMax.inputStrings, inputDisplayName: 'version' });
  }

  if (category) {
    assertInputStringLength(category, { ...options.minMax.inputStrings, inputDisplayName: 'category' });
  }

  if (section) {
    assertInputStringLength(section, { ...options.minMax.inputStrings, inputDisplayName: 'section' });
  }

  const { availableVersions, latestVersion, availableSchemasVersions, latestSchemasVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);
  const available = isSchema ? availableSchemasVersions : availableVersions;

  assertInput(!version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${available.join(', ')}`);

  return {
    normalizedVersion,
    updatedVersion: normalizedVersion || latestVersion,
    updatedSchemasVersion: normalizedVersion || latestSchemasVersion,
    availableVersions,
    availableSchemasVersions,
    available
  };
};

/**
 * Resolves documentation content (Docs Template).
 *
 * @param {FilterPatternFlyFilters} params - The filters to resolve.
 * @param {object} [options] - Global options.
 * @returns {Promise<object>} The resolved documentation.
 */
const resolvePatternFlyResources = async (params: FilterPatternFlyFilters, options = getOptions()) => {
  assertInputStringLength(params.name, { ...options.minMax.inputStrings, inputDisplayName: 'name' });

  const { updatedVersion } = await prepareResolution(params, options);

  const { byEntry } = await filterPatternFly.memo({ ...params, version: updatedVersion });

  assertInput(byEntry.length > 0, () => {
    const filters = [params.version && 'version', params.category && 'category', params.section && 'section'].filter(Boolean);

    return `No documentation found for "${params.name}".${filters.length ? ` Try using different parameters for ${filters.join(', ')}.` : ''}`;
  });

  const docs = await processDocsFunction.memo(byEntry.map(entry => entry.path).filter(Boolean));

  return { docs, entries: byEntry };
};

/**
 * Resolves JSON schema content (Schemas Template).
 *
 * @param {FilterPatternFlyFilters} params - The filters to resolve.
 * @param {object} [options] - Global options.
 * @returns {Promise<object>} The resolved schema.
 */
const resolvePatternFlySchema = async (params: FilterPatternFlyFilters, options = getOptions()) => {
  assertInputStringLength(params.name, { ...options.minMax.inputStrings, inputDisplayName: 'name' });

  const { updatedSchemasVersion, availableSchemasVersions } = await prepareResolution({ ...params, isSchema: true }, options);

  const { byEntry } = await filterPatternFly.memo({ ...params, version: updatedSchemasVersion });
  const schemaEntry = byEntry.find(entry => entry.uriSchemas);

  assertInput(schemaEntry, () => {
    const suggestion = !availableSchemasVersions.includes(updatedSchemasVersion)
      ? ` Component schemas are only available for: ${availableSchemasVersions.join(', ')}`
      : '';

    return `No component JSON schemas found for "${params.name}".${suggestion}`;
  });

  const schema = await getPatternFlyComponentSchema.memo(schemaEntry!.name);

  return { schema, entry: schemaEntry };
};

/**
 * Resolves and formats index resources (Docs/Schemas Index).
 *
 * @param {FilterPatternFlyFilters & { resourceType?: 'docs' | 'schemas' }} params - The filters to resolve.
 * @param {object} [options] - Global options.
 * @returns {Promise<object>} The resolved index.
 */
const resolvePatternFlyIndex = async (params: FilterPatternFlyFilters & { resourceType?: 'docs' | 'schemas' }, options = getOptions()) => {
  const { resourceType = 'docs' } = params;
  const { updatedVersion, updatedSchemasVersion, available } = await prepareResolution({ ...params, isSchema: resourceType === 'schemas' }, options);

  const version = resourceType === 'schemas' ? updatedSchemasVersion : updatedVersion;

  const { byEntry } = await filterPatternFly.memo({ ...params, version });

  const grouped = new Map<string, { name: string, version: string, cats: Set<string> }>();

  byEntry.forEach(entry => {
    const targetUri = resourceType === 'schemas' ? entry.uriSchemas : entry.uri;

    if (!targetUri) {
      return;
    }

    if (!grouped.has(targetUri)) {
      grouped.set(targetUri, { name: entry.name, version: entry.version, cats: new Set([entry.displayCategory]) });
    } else {
      grouped.get(targetUri)!.cats.add(entry.displayCategory);
    }
  });

  const searchStr = buildSearchString({ section: params.section, category: params.category }, { prefix: true });
  const indexLines = Array.from(grouped.entries())
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([uri, data], index) => `${index + 1}. [${data.name}${resourceType === 'docs' ? ` - ${Array.from(data.cats).join(', ')}` : ''} (${data.version})](${uri}${searchStr})`);

  return { version, available, content: indexLines, count: indexLines.length };
};

/**
 * Centralized completion logic for PatternFly resources.
 *
 * @param {FilterPatternFlyFilters} filters - The filters to complete.
 * @returns {Promise<object>} The completion results.
 */
const paramCompletion = async (filters: FilterPatternFlyFilters) => {
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(filters.version);
  const { byEntry } = await filterPatternFly.memo({ ...filters, version: normalizedVersion || filters.version });

  const names = new Set<string>();
  const categories = new Set<string>();
  const sections = new Set<string>();
  const versions = new Set<string>();
  const schemas = new Set<string>();

  for (const entry of byEntry) {
    if (typeof entry.name === 'string') {
      names.add(entry.name);
    }

    if (typeof entry.category === 'string') {
      categories.add(entry.category);
    }

    if (typeof entry.section === 'string') {
      sections.add(entry.section);
    }

    if (typeof entry.version === 'string') {
      versions.add(entry.version);
    }

    if (entry.uriSchemas !== undefined && typeof entry.name === 'string') {
      schemas.add(entry.name);
    }
  }

  return {
    names: Array.from(names).sort(),
    categories: Array.from(categories).sort(),
    schemas: Array.from(schemas).sort(),
    sections: Array.from(sections).sort(),
    versions: Array.from(versions).sort()
  };
};

export {
  paramCompletion,
  resolvePatternFlyIndex,
  resolvePatternFlySchema,
  resolvePatternFlyResources
};

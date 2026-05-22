import { filterPatternFly, searchPatternFly, type FilterPatternFlyFilters } from './patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import {
  getPatternFlyMcpResources,
  getPatternFlyComponentSchema
} from './patternFly.getResources';
import { processDocsFunction } from './server.getResources';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions } from './options.context';
import { buildSearchString, stringJoin, parseUrl } from './server.helpers';

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
 * Builds a suggestive error message when no resources are found.
 *
 * @param {string} baseMessage - The base error message.
 * @param {FilterPatternFlyFilters} params - The filters used.
 * @param {object} suggestions - Contextual suggestions.
 * @param {object} globalSuggestions - Global suggestions.
 * @param {string[]} [fuzzyNames] - Optional list of fuzzy name matches.
 * @returns {string} The suggestive error message.
 */
const buildSuggestiveErrorMessage = (baseMessage: string, params: FilterPatternFlyFilters, suggestions: any, globalSuggestions: any, fuzzyNames?: string[]) => {
  const { category, section } = params;
  const isCategory = typeof category === 'string' && category.length > 0;
  const isSection = typeof section === 'string' && section.length > 0;

  return stringJoin.newlineFiltered(
    baseMessage,
    fuzzyNames && fuzzyNames.length > 0
      ? `Did you mean ${fuzzyNames.map(name => `"${name}"`).join(', ')}?`
      : undefined,
    isCategory && !globalSuggestions.categories.includes(category)
      ? `Category "${category}" is invalid. Valid: ${globalSuggestions.categories.join(', ')}`
      : undefined,
    isSection && !globalSuggestions.sections.includes(section)
      ? `Section "${section}" is invalid. Valid: ${globalSuggestions.sections.join(', ')}`
      : undefined,
    isCategory && globalSuggestions.categories.includes(category) && suggestions.sections.length > 0
      ? `Valid sections for category "${category}": ${suggestions.sections.join(', ')}`
      : undefined,
    isSection && globalSuggestions.sections.includes(section) && suggestions.categories.length > 0
      ? `Valid categories for section "${section}": ${suggestions.categories.join(', ')}`
      : undefined,
    'Try removing filters or browse the index for all available resources.'
  );
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

  if (byEntry.length === 0) {
    const { searchResults } = await searchPatternFly.memo(params.name, { version: updatedVersion });
    const fuzzyNames = searchResults.map(result => result.item).slice(0, 3);

    const suggestions = await paramCompletion({
      version: updatedVersion,
      category: params.category,
      section: params.section
    });

    const globalSuggestions = await paramCompletion({ version: updatedVersion });

    assertInput(false, buildSuggestiveErrorMessage(
      `No documentation found for "${params.name}".`,
      params,
      suggestions,
      globalSuggestions,
      fuzzyNames
    ));
  }

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

  if (!schemaEntry) {
    const { searchResults } = await searchPatternFly.memo(params.name, { version: updatedSchemasVersion });
    const fuzzyNames = searchResults.filter(result => result.uriSchemas).map(result => result.item).slice(0, 3);

    const suggestions = await paramCompletion({
      version: updatedSchemasVersion,
      category: params.category,
      section: params.section
    });

    const globalSuggestions = await paramCompletion({ version: updatedSchemasVersion });

    const suggestion = !availableSchemasVersions.includes(updatedSchemasVersion)
      ? ` Component schemas are only available for: ${availableSchemasVersions.join(', ')}`
      : '';

    assertInput(false, buildSuggestiveErrorMessage(
      `No component JSON schemas found for "${params.name}".${suggestion}`,
      params,
      suggestions,
      globalSuggestions,
      fuzzyNames
    ));
  }

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

  if (byEntry.length === 0) {
    const suggestions = await paramCompletion({
      version,
      category: params.category,
      section: params.section
    });

    const globalSuggestions = await paramCompletion({ version });

    const resourceName = resourceType === 'schemas' ? 'component JSON schemas' : 'documentation';

    assertInput(false, buildSuggestiveErrorMessage(
      `No ${resourceName} found for "${version}".`,
      params,
      suggestions,
      globalSuggestions
    ));
  }

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

/**
 * Resolves a list of documentation URLs, paths or URIs.
 *
 * @param {string[]} urlList - The list of URLs/paths/URIs to resolve.
 * @returns {Promise<string[]>} The list of resolved paths or URLs.
 */
const resolvePatternFlyUrls = async (urlList: string[]) => {
  const resolvedPaths: string[] = [];

  for (const item of urlList) {
    const parsed = parseUrl(item, { prefix: 'patternfly' });

    if (parsed) {
      const { byEntry } = await filterPatternFly.memo({
        uri: item,
        name: parsed.path.split('/').pop(),
        version: parsed.params.version
      });

      if (byEntry.length > 0) {
        resolvedPaths.push(...byEntry.map(entry => entry.path).filter(Boolean));
        continue;
      }
    }

    resolvedPaths.push(item);
  }

  return Array.from(new Set(resolvedPaths));
};

export {
  paramCompletion,
  resolvePatternFlyIndex,
  resolvePatternFlySchema,
  resolvePatternFlyResources,
  resolvePatternFlyUrls
};

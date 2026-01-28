import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { memo } from './server.caching';
import { getPatternFlyMcpDocs } from './patternFly.getResources';

/**
 * Normalize the PatternFly documentation index by category links.
 *
 * @returns An object containing normalized category names with associated Markdown links.
 */
const normalizePatternFlyDocsIndex = () => {
  const { byCategory } = getPatternFlyMcpDocs.memo();
  const byCategoryLinks: { [key: string]: string[] } = {};

  Object.entries(byCategory).forEach(([category, entries]) => {
    byCategoryLinks[category] ??= [];
    let categoryLabel = category;

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

    entries.forEach(entry => {
      byCategoryLinks[categoryLabel]?.push(`[@patternfly/${entry.displayName} - ${categoryLabel}](${entry.path})`);
    });
  });

  return byCategoryLinks;
};

/**
 * Memoized version of normalizePatternFlyDocsIndex.
 */
normalizePatternFlyDocsIndex.memo = memo(normalizePatternFlyDocsIndex);

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/index';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: 'A comprehensive list of PatternFly documentation links, organized by components, layouts, charts, and local files.',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for the documentation index.
 *
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async () => {
    const normalizedIndex = normalizePatternFlyDocsIndex.memo();

    const allDocs = stringJoin.newline(
      '# PatternFly Documentation Index',
      '',
      ...Object.entries(normalizedIndex).map(([category, links]) =>
        stringJoin.newline(`## ${category}`, '', ...links))
    );

    return {
      contents: [
        {
          uri: 'patternfly://docs/index',
          mimeType: 'text/markdown',
          text: allDocs
        }
      ]
    };
  }
];

export { patternFlyDocsIndexResource, normalizePatternFlyDocsIndex, NAME, URI_TEMPLATE, CONFIG };

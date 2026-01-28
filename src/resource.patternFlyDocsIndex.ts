import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import docsCatalog from './docs.json';

/**
 * Get documentation links by section from the JSON catalog.
 *
 * @param section - The section to filter by
 */
const getDocsBySection = (section: string) => {
  const result: string[] = [];

  Object.entries(docsCatalog.docs).forEach(([name, entries]) => {
    (entries as any[]).forEach(entry => {
      if (entry.section === section) {
        if (section === 'local') {
          result.push(`[@patternfly/${entry.displayName}](${entry.path})`);
        } else {
          let categoryLabel = entry.category;

          if (categoryLabel === 'design-guidelines') {
            categoryLabel = 'Design Guidelines';
          } else if (categoryLabel === 'accessibility') {
            categoryLabel = 'Accessibility';
          } else if (categoryLabel === 'react') {
            categoryLabel = 'Examples';
          } else {
            // Capitalize first letter of other categories
            categoryLabel = categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1);
          }

          result.push(`[@patternfly/${name} - ${categoryLabel}](${entry.path})`);
        }
      }
    });
  });

  return result;
};

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
    const allDocs = stringJoin.newline(
      '# PatternFly Documentation Index',
      '',
      '## Components',
      ...getDocsBySection('components'),
      '',
      '## Layouts',
      ...getDocsBySection('layouts'),
      '',
      '## Charts',
      ...getDocsBySection('charts'),
      '',
      '## Local Documentation',
      ...getDocsBySection('local')
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

export { patternFlyDocsIndexResource, NAME, URI_TEMPLATE, CONFIG };

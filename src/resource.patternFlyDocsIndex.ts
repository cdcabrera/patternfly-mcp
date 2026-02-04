import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { getPatternFlyMcpDocs } from './patternFly.getResources';

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
    const { markdownIndex } = await getPatternFlyMcpDocs.memo();

    const allDocs = stringJoin.newline(
      '# PatternFly Documentation Index',
      '',
      '',
      ...markdownIndex
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

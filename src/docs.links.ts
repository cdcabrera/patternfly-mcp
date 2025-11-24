/**
 * Documentation Links Helper
 *
 * Provides compiled lists of all documentation links for use in standalone scripts,
 * link validation, and testing.
 */

import { CHART_DOCS } from './docs.chart';
import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { getLocalDocs } from './docs.local';
import { getOptions } from './options.context';

/**
 * Extract URL from markdown link format: [text](url)
 *
 * @param markdownLink - Markdown link string
 * @returns URL or undefined if not a valid markdown link
 */
const extractUrlFromMarkdown = (markdownLink: string): string | undefined => {
  const match = markdownLink.match(/\[.*?\]\((.*?)\)/);

  return match ? match[1] : undefined;
};

/**
 * Get all external documentation links (charts, components, layouts)
 *
 * @returns Array of URLs from external documentation sources
 */
const getExternalLinks = (): string[] => {
  const allDocs = [
    ...CHART_DOCS,
    ...COMPONENT_DOCS,
    ...LAYOUT_DOCS
  ];

  const urls = allDocs
    .map(extractUrlFromMarkdown)
    .filter((url): url is string => url !== undefined && url.startsWith('http'));

  return urls;
};

/**
 * Get all local documentation links
 *
 * @param options - Optional options (defaults to current context)
 * @returns Array of local file paths
 */
const getLocalLinks = (options = getOptions()): string[] => {
  const localDocs = getLocalDocs(options);

  return localDocs
    .map(extractUrlFromMarkdown)
    .filter((path): path is string => path !== undefined && !path.startsWith('http'));
};

/**
 * Get all documentation links (external + local)
 *
 * @param options - Optional options (defaults to current context)
 * @returns Object with external and local link arrays
 */
const getAllLinks = (options = getOptions()) => ({
  external: getExternalLinks(),
  local: getLocalLinks(options),
  all: [...getExternalLinks(), ...getLocalLinks(options)]
});

/**
 * Get all documentation links with metadata
 *
 * @param options - Optional options (defaults to current context)
 * @returns Array of link objects with metadata
 */
const getLinksWithMetadata = (options = getOptions()) => {
  const allDocs = [
    ...CHART_DOCS.map(doc => ({ category: 'chart', doc })),
    ...COMPONENT_DOCS.map(doc => ({ category: 'component', doc })),
    ...LAYOUT_DOCS.map(doc => ({ category: 'layout', doc })),
    ...getLocalDocs(options).map(doc => ({ category: 'local', doc }))
  ];

  return allDocs.map(({ category, doc }) => {
    const url = extractUrlFromMarkdown(doc);
    const textMatch = doc.match(/\[(.*?)\]/);

    return {
      category,
      text: textMatch ? textMatch[1] : undefined,
      url: url || undefined,
      markdown: doc,
      isExternal: url ? url.startsWith('http') : false,
      isLocal: url ? !url.startsWith('http') : false
    };
  }).filter(link => link.url !== undefined);
};

export {
  extractUrlFromMarkdown,
  getExternalLinks,
  getLocalLinks,
  getAllLinks,
  getLinksWithMetadata
};


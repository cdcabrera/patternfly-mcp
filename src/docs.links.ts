/**
 * Documentation Links Helper
 *
 * Provides compiled lists of all documentation links for use in standalone scripts,
 * link validation, and testing.
 */

import { getAllDocLinks, getDoc } from './docs';
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
 * Get all external documentation links (from JSON index)
 *
 * @param version - PatternFly version (default: '6')
 * @returns Array of URLs from external documentation sources
 */
const getExternalLinks = (version?: string): string[] => {
  const allDocLinks = getAllDocLinks(version || '6');

  const urls = allDocLinks
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
  const version = '6'; // Default to version 6 for now
  const allDocLinks = getAllDocLinks(version);
  const localDocs = getLocalDocs(options);

  // Get metadata from JSON index
  const externalLinks = allDocLinks.map(doc => {
    const url = extractUrlFromMarkdown(doc);
    const textMatch = doc.match(/\[(.*?)\]/);
    const componentMatch = doc.match(/@patternfly\/([^-]+)/);
    const componentName = componentMatch && componentMatch[1] ? componentMatch[1].trim() : undefined;

    // Try to determine category from component name
    let category = 'unknown';

    if (componentName) {
      const entry = getDoc(componentName);

      if (entry) {
        category = entry.category;
      }
    }

    return {
      category,
      text: textMatch ? textMatch[1] : undefined,
      url: url || undefined,
      markdown: doc,
      isExternal: url ? url.startsWith('http') : false,
      isLocal: false
    };
  });

  const localLinks = localDocs.map(doc => {
    const url = extractUrlFromMarkdown(doc);
    const textMatch = doc.match(/\[(.*?)\]/);

    return {
      category: 'local',
      text: textMatch ? textMatch[1] : undefined,
      url: url || undefined,
      markdown: doc,
      isExternal: false,
      isLocal: url ? !url.startsWith('http') : false
    };
  });

  return [...externalLinks, ...localLinks].filter((link): link is NonNullable<typeof link> => link.url !== undefined);
};

export {
  extractUrlFromMarkdown,
  getExternalLinks,
  getLocalLinks,
  getAllLinks,
  getLinksWithMetadata
};


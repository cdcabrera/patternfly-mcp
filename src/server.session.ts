/**
 * Ephemeral session store for artifacts generated during a skill workflow
 * or external web fetches.
 */

// In-memory registry for session-scoped resources
const sessionResources = new Map<string, { content: string, mimeType: string }>();

/**
 * Register a session-scoped resource.
 *
 * @param uri - Internal patternfly://session/ URI
 * @param content - Resource content
 * @param mimeType - Resource MIME type
 */
const registerSessionResource = (uri: string, content: string, mimeType: string) => {
  sessionResources.set(uri, { content, mimeType });
};

/**
 * Retrieve a session-scoped resource.
 *
 * @param uri - Internal patternfly://session/ URI
 * @returns Resource content and MIME type, or undefined if not found
 */
const getSessionResource = (uri: string) => sessionResources.get(uri);

/**
 * Clear all session-scoped resources.
 */
const clearSessionResources = () => sessionResources.clear();

export {
  registerSessionResource,
  getSessionResource,
  clearSessionResources
};

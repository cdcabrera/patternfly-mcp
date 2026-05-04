/**
 * Session-scoped bodies for skill workflow artifacts. Keys are full URIs
 * (e.g. `patternfly://skills/{id}`). Populated when external tools return
 * `_pfSkillArtifactMap` from the Tools Host; read by the skills resource handler.
 */

const MAX_ARTIFACTS_PER_SESSION = 64;

type SkillArtifactBody = {
  mimeType: string;
  text: string;
};

const store = new Map<string, Map<string, SkillArtifactBody>>();

const isSkillArtifactUri = (uri: string) => uri.startsWith('patternfly://skills/');

const isValidBody = (value: unknown): value is SkillArtifactBody => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Record<string, unknown>;

  return typeof body.mimeType === 'string' && typeof body.text === 'string';
};

/**
 * Merge artifact bodies into the cache for a session. Invalid entries are skipped.
 *
 * @param sessionId - Async session id from `getSessionOptions()`.
 * @param artifactMap - Map of full URI string to `{ mimeType, text }`.
 */
const registerSkillArtifacts = (sessionId: string, artifactMap: Record<string, unknown>) => {
  let sessionMap = store.get(sessionId);

  if (!sessionMap) {
    sessionMap = new Map();
    store.set(sessionId, sessionMap);
  }

  for (const [uri, body] of Object.entries(artifactMap)) {
    if (!isSkillArtifactUri(uri) || !isValidBody(body)) {
      continue;
    }

    sessionMap.set(uri, { mimeType: body.mimeType, text: body.text });
  }

  while (sessionMap.size > MAX_ARTIFACTS_PER_SESSION) {
    const firstKey = sessionMap.keys().next().value;

    if (firstKey === undefined) {
      break;
    }

    sessionMap.delete(firstKey);
  }
};

/**
 * Return cached body for a URI, or undefined if missing.
 *
 * @param sessionId - Async session id from `getSessionOptions()`.
 * @param uri - Full `patternfly://skills/...` URI used as cache key.
 */
const getSkillArtifact = (sessionId: string, uri: string): SkillArtifactBody | undefined =>
  store.get(sessionId)?.get(uri);

/**
 * Remove all cached artifacts for a session (e.g. Tools Host shutdown).
 *
 * @param sessionId - Async session id from `getSessionOptions()`.
 */
const clearSkillArtifactsForSession = (sessionId: string) => {
  store.delete(sessionId);
};

export {
  registerSkillArtifacts,
  getSkillArtifact,
  clearSkillArtifactsForSession,
  MAX_ARTIFACTS_PER_SESSION,
  type SkillArtifactBody
};

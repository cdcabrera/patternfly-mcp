/**
 * Get the current Node.js major version.
 *
 * @note Do not use the semver package here. This is purposefully a light implementation
 * meant to be shared externally without the overhead of additional packaging.
 *
 * @param nodeVersion
 * @returns Node.js major version.
 */
const getNodeMajorVersion = (nodeVersion: unknown): number => {
  if (typeof nodeVersion !== 'string') {
    return 0;
  }

  const sanitizedVersion = nodeVersion?.replace?.(/^[^0-9]+/, '');
  const major = Number.parseInt(sanitizedVersion.split('.')?.[0] || '0', 10);

  return Number.isFinite(major) ? major : 0;
};

/**
 * Normalizes experimental options.
 *
 * Keys starting with 'experimental-' are stripped of the prefix and included in
 * the normalized object under their internal representation, while others remain unchanged.
 *
 * @param {Record<string, unknown>} [options={}] - Record containing key-value pairs of options.
 * @param experimentalOptions
 * @returns {{ normalized: Record<string, unknown>, usedExperimental: string[] }}
 *          An object containing:
 *          - `normalized`: A record where 'experimental-' prefixed keys are modified to their internal
 *            representation and other keys are unchanged.
 *          - `usedExperimental`: An array of keys that were identified as experimental and processed.
 */
const normalizeExperimentalOptions = (options: Record<string, unknown> = {}, experimentalOptions) => {
  const normalized: Record<string, unknown> = {};
  const usedExperimental: string[] = [];

  Object.entries(options).forEach(([key, value]) => {
    if (key.startsWith('experimental-')) {
      const internalKey = key.replace('experimental-', '');

      normalized[internalKey] = value;
      usedExperimental.push(internalKey);
    } else if (!experimentalOptions.has(key)) {
      normalized[key] = value;
    }
  });

  return { normalized, usedExperimental };
};

export { getNodeMajorVersion, normalizeExperimentalOptions };

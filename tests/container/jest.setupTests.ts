// Shared helpers for container Jest tests
import { jest } from '@jest/globals';

declare global {
  var envNodeVersion: number;
  var itSkip: (check: unknown) => typeof it | typeof it.skip;
}

/**
 * Get the Node.js major version of the current process.
 *
 * @param fallback - Fallback value if the major version cannot be determined. Defaults to `0`.
 */
export const getNodeVersion = (fallback: number = 0) => {
  const major = Number.parseInt(process?.versions?.node?.split?.('.')?.[0] || String(fallback), 10);

  if (Number.isFinite(major)) {
    return major;
  }

  return fallback;
};

/**
 * The Node.js major version of the current process.
 */
export const envNodeVersion = getNodeVersion(22);

global.envNodeVersion = envNodeVersion;

/**
 * Conditionally skip "it" test statements.
 *
 * @example
 *   itSkip(true)('should do a thing...', () => { ... });
 *
 * @param {*|boolean} check - Any `truthy`/`falsy` value
 * @returns On `truthy` returns `it`, on `falsy` returns `it.skip`.
 */
export const itSkip = (check: unknown): typeof it | typeof it.skip => (check ? it : it.skip);

global.itSkip = itSkip;

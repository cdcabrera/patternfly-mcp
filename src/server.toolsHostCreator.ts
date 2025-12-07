import { type McpTool, type McpToolCreator } from './server';
import { log } from './logger';

/**
 * Minimally filter, resolve, then cache tool creators from external module export during the child process.
 *
 * Supported module export shapes `default` or `named exports`, any other shape is ignored:
 *  - function returning a realized tool tuple -> wraps and caches as a creator (with .toolName)
 *  - function returning an array of creators -> returns them directly
 *  - array of creators -> returns it directly
 *
 * It does:
 *   - Perform a probe of function exports
 *   - The probe executes at most once per export
 *   - Realized tuples are cached to avoid duplicate setup
 *
 * It does not:
 *   - Perform schema normalization.
 *   - Import modules
 *
 * @param moduleExports - The dynamic module exports object (may include default export).
 * @param [toolOptions] - A purposefully refined set of options passed to "external" factory functions.
 * @returns {McpToolCreator[]} A normalized array of tool creators.
 */
const resolveExternalCreators =
  (moduleExports: unknown, toolOptions?: Record<string, unknown> | undefined): McpToolCreator[] => {
    const mod = moduleExports as any;
    const candidates: unknown[] = [mod?.default, mod].filter(Boolean);

    for (const candidate of candidates) {
    // Case A: function export → call once with options
      if (typeof candidate === 'function') {
        try {
          const result = (candidate as (o?: unknown) => unknown)(toolOptions);

          // A1: realized tuple returned → cache & wrap as a creator with name tagging
          if (Array.isArray(result) && typeof result[0] === 'string' && typeof (result as unknown[])[2] === 'function') {
            const cached = result as McpTool;

            const wrapped: McpToolCreator = () => cached;

            (wrapped as any).toolName = cached[0];

            return [wrapped];
          }

          // A2: creators array returned
          if (Array.isArray(result) && result.every(fn => typeof fn === 'function')) {
            return result as McpToolCreator[];
          }
        // Unsupported function result -> fall through and try next candidate
        } catch {
        // Avoid no-arg probes by design; move to next candidate
          log.debug?.('tool factory threw during options-first call; skipping');
        }
      }

      // Case B: array of tool creators export
      if (Array.isArray(candidate) && candidate.every(fn => typeof fn === 'function')) {
        return candidate as McpToolCreator[];
      }
    }

    return [];
  };

export { resolveExternalCreators };

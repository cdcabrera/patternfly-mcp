import { type McpTool, type McpToolCreator } from './server';
import { log } from './logger';

/**
 * Normalize dynamic module exports into McpToolCreator[] using a single, options-first call.
 * Supported module export shapes (default or named):
 *  - function returning a realized tool tuple → wraps and caches as a creator (with .toolName)
 *  - function returning an array of creators → returns them directly
 *  - array of creators → returns it directly
 * Any other shape is ignored.
 *
 * @param {unknown} moduleExports - The dynamic module exports object (may include default export).
 * @param {unknown} [toolOptions] - Options passed to factory functions (ToolOptions in child process).
 * @returns {McpToolCreator[]} A normalized array of tool creators.
 */
const normalizeToCreators = (moduleExports: unknown, toolOptions?: unknown): McpToolCreator[] => {
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
        // Unsupported function result → fall through and try next candidate
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

export { normalizeToCreators };

import { type McpTool, type McpToolCreator } from './server';

/**
 * Guard for an array of creators. File-scoped helper.
 *
 * @param value
 * @returns `true` if value is an array of functions.
 */
const isCreatorsArray = (value: unknown): value is McpToolCreator[] =>
  Array.isArray(value) && value.every(fn => typeof fn === 'function');

/**
 * Guard for tool tuple. File-scoped helper.
 *
 * @param value
 * @returns `true` if value is a tool tuple.
 */
const isRealizedToolTuple = (value: unknown): value is McpTool =>
  Array.isArray(value) &&
  typeof value[0] === 'string' &&
  typeof (value as unknown[])[2] === 'function';

/**
 * Wrap a realized tool tuple in a creator function that returns the tuple itself.
 * File-scoped helper.
 *
 * @param cached
 * @returns A normalized creator function that returns the cached tool tuple.
 */
const wrapCachedTuple = (cached: McpTool): McpToolCreator & { toolName: string } => {
  const wrapped: McpToolCreator = () => cached;

  (wrapped as any).toolName = cached[0];

  return wrapped as McpToolCreator & { toolName: string };
};

/**
 * Options for resolveExternalCreators.
 */
type ResolveOptions = {
  throwOnEmpty?: boolean;
};

/**
 * Minimally filter, resolve, then cache tool creators from external module export during the child process.
 *
 * Supported module export shapes `default` or `named exports`, any other shape is ignored:
 * - function returning a realized tool tuple -> wraps and caches as a creator (with .toolName)
 * - function returning an array of creators -> returns them directly
 * - array of creators -> returns it directly
 *
 * Probes function exports at most once with toolOptions and never re-probes without options.
 *
 * @param moduleExports
 * @param toolOptions
 * @param root0
 * @param root0.throwOnEmpty
 */
const resolveExternalCreators = (
  moduleExports: unknown,
  toolOptions?: Record<string, unknown> | undefined,
  { throwOnEmpty = false }: ResolveOptions = {}
): McpToolCreator[] => {
  const mod = moduleExports as any;
  const candidates: unknown[] = [mod?.default, mod].filter(Boolean);

  const observed: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      observed.push('function');
      try {
        const result = (candidate as (o?: unknown) => unknown)(toolOptions);

        if (isRealizedToolTuple(result)) {
          return [wrapCachedTuple(result)];
        }

        if (isCreatorsArray(result)) {
          return result;
        }
      } catch {
        // Move to next candidate
      }

      continue;
    }

    if (isCreatorsArray(candidate)) {
      observed.push('creators[]');

      return candidate as McpToolCreator[];
    }

    // Note shape for diagnostics if we end up throwing on empty
    observed.push(Array.isArray(candidate) ? 'array' : typeof candidate);
  }

  if (throwOnEmpty) {
    const shapes = observed.length ? ` Observed candidate shapes: ${observed.join(', ')}` : '';

    throw new Error(`No usable tool creators found from module exports.${shapes}`);
  }

  return [];
};

export { resolveExternalCreators, type ResolveOptions };

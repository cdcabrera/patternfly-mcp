import { AsyncLocalStorage } from 'node:async_hooks';
import type { GlobalOptions } from './options';
import { getDefaultOptions } from './options';

/**
 * AsyncLocalStorage instance for per-instance options
 *
 * Each server instance gets its own isolated context, allowing multiple
 * instances to run with different options without conflicts.
 */
const optionsContext = new AsyncLocalStorage<GlobalOptions>();

/**
 * Get current context options
 * Falls back to default options if no context is set
 *
 * This should always return a valid options object. In normal operation,
 * the context should be set before any code runs, but we provide a
 * fallback for safety.
 *
 * @returns {GlobalOptions} Current options from context or defaults
 */
export const getOptions = (): GlobalOptions => {
  const context = optionsContext.getStore();

  if (context) {
    return context;
  }

  // Fallback to defaults if no context set (shouldn't happen in normal operation)
  // This provides safety but indicates a programming error if it occurs
  return getDefaultOptions();
};

/**
 * Set options in current async context
 * Freezes the options within this context (not globally)
 *
 * This allows multiple server instances to have different options
 * without interfering with each other.
 *
 * @param {GlobalOptions} options - Options to set in context
 */
export const setOptions = (options: GlobalOptions): void => {
  // Create a frozen copy (don't freeze the original)
  // This ensures immutability within the context
  const frozen = Object.freeze({ ...options });

  optionsContext.enterWith(frozen);
};

/**
 * Run a function with specific options context
 * Useful for testing or programmatic usage
 *
 * @param {GlobalOptions} options - Options to use in context
 * @param {Function} fn - Function to run with options
 * @returns {Promise<T>} Result of function
 */
export const runWithOptions = async <T>(
  options: GlobalOptions,
  fn: () => Promise<T>
): Promise<T> => {
  const frozen = Object.freeze({ ...options });

  return optionsContext.run(frozen, fn);
};

export { optionsContext };


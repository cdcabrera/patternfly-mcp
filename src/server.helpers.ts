/**
 * Check if value is a plain object
 *
 * @param obj - Value to check
 * @returns True if value is a plain object
 */
export const isPlainObject = (obj: unknown): obj is Record<string, unknown> =>
  typeof obj === 'object' && obj !== null && !Array.isArray(obj) && obj.constructor === Object;

/**
 * Generate hash code from string
 * String hash generator based from: https://gist.github.com/jlevy/c246006675becc446360a798e2b2d781
 *
 * @param str - String to hash
 * @returns Hash string
 */
const hashCode = (str: string): string => {
  const encoded = new TextEncoder().encode(str);

  const hash = Array.from(new Uint8Array(encoded)).reduce((hash, byte) => {
    // eslint-disable-next-line no-bitwise
    let updatedHash = (hash << 5) - hash + byte;

    // eslint-disable-next-line no-bitwise
    updatedHash |= 0;

    return updatedHash;
  }, 0);

  return `c${hash}`;
};

/**
 * Generate a consistent hash
 * String hash generator based from: https://gist.github.com/jlevy/c246006675becc446360a798e2b2d781
 *
 * @param anyValue - Value to hash
 * @returns Hash string
 */
export const generateHash = (anyValue: unknown): string => {
  const replacer = (key: string, value: unknown): unknown => {
    // Handle nested objects
    if (value !== anyValue && isPlainObject(value)) {
      return JSON.stringify(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      );
    }

    // Handle functions
    if (typeof value === 'function') {
      return value.toString();
    }

    return value;
  };

  const stringified = isPlainObject(anyValue)
    ? JSON.stringify(
      Object.entries(anyValue).sort(([a], [b]) => a.localeCompare(b)),
      replacer
    )
    : `${typeof anyValue}${anyValue?.toString() || anyValue}`;

  return hashCode(JSON.stringify({ value: stringified }));
};

/**
 * Check if "is a Promise", "Promise like".
 *
 * @param obj - Object to check
 * @returns True if object is a Promise
 */
const isPromise = (obj: unknown) => /^\[object (Promise|Async|AsyncFunction)]/.test(Object.prototype.toString.call(obj));

export {
  isPromise
};

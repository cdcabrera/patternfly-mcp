import {} from './server.task';
import {} from './server.getResources';
import {} from './server.fetch';
import { memo } from './server.caching';
import { isPlainObject } from './server.helpers';

/**
 * Parses the given payload and determines its state and structure.
 *
 * @param payload - Input payload to be parsed.
 * @returns An object containing:
 * - `isEmpty`: A boolean indicating whether the parsed payload is considered empty.
 * - `payload`: The parsed version of the input payload. If the input is a string
 *   and can be parsed as JSON without error, the parsed result is returned.
 *   Otherwise, the trimmed string or original value is provided.
 */
const parsePayload = (payload: unknown) => {
  const updatedPayload = typeof payload === 'string' ? payload.trim() : '';
  let isEmpty;
  let parsedPayload;

  try {
    parsedPayload = JSON.parse(updatedPayload);

    if (typeof parsedPayload === 'number') {
      isEmpty = false;
    } else {
      isEmpty = (Array.isArray(parsedPayload) && parsedPayload.length === 0) ||
        (isPlainObject(parsedPayload) && Object.keys(parsedPayload).length === 0);
    }
  } catch {
    parsedPayload = updatedPayload;
    isEmpty = updatedPayload.length === 0;
  }

  return { isEmpty, payload: parsedPayload };
};

/**
 * Memoized version of parsePayload.
 */
parsePayload.memo = memo(parsePayload);

/**
 * Determines if the parsed payload is empty.
 *
 * @param payload - Data to be parsed and evaluated for emptiness.
 * @returns Returns `true` if the parsed payload is empty, otherwise `false`.
 */
const isEmptyParsedPayload = (payload: unknown): boolean => {
  const { isEmpty } = parsePayload.memo(payload);

  return isEmpty;
};

/**
 * Memoized version of isEmptyParsedPayload.
 */
isEmptyParsedPayload.memo = memo(isEmptyParsedPayload);

/**
 * Determines if the payload is empty.
 *
 * @param payload - Data to be evaluated for emptiness.
 * @returns Returns `true` if the payload is empty, otherwise `false`.
 */
const isEmptyPayload = (payload: unknown): boolean => {
  if (typeof payload === 'string') {
    const trimmedPayload = payload.trim();

    return trimmedPayload === '' || trimmedPayload === '{}' || trimmedPayload === '[]' || trimmedPayload === 'null' || trimmedPayload === '""';
  }

  return payload === null || payload === undefined || isEmptyParsedPayload(payload);
};

/**
 * Memoized version of isEmptyPayload.
 */
isEmptyPayload.memo = memo(isEmptyPayload);

const crawler = () => {};

const apiSpider = () => {};

export {
  apiSpider,
  crawler,
  isEmptyParsedPayload,
  isEmptyPayload
};

import { Readable } from 'node:stream';
import { type ReadableStream } from 'node:stream/web';
import { getOptions } from './options.context';
import { formatUnknownError, log } from './logger';

// type NodeReadableStream<t> = ReadableStream<t>;

/**
 * Fetch state and response types
 *
 * @interface FetchState
 *
 * @property phase - The current state of the fetch operation.
 * @property type - The type of data expected from the fetch operation.
 * @property progress - The percentage progress of the fetch operation (0 to 100) or undefined if chunked/unknown length.
 * @property bytesReceived - The number of bytes received from the fetch operation.
 * @property message - A message, error or otherwise, associated with the fetch operation.
 * @property error - An error object associated with the fetch operation.
 * @property data - The data received from the fetch operation.
 */
interface FetchState {
  phase: 'idle' | 'loading' | 'success' | 'error' | 'cancelled';
  type?: 'json' | 'text' | 'binary' | undefined;
  progress?: number | undefined;
  bytesReceived?: number | undefined;
  message?: string | undefined;
  error?: FetchError | undefined;
  data?: unknown | undefined;
}

/**
 * Fetch response object.
 */
interface FetchResponse {
  type: 'json' | 'text' | 'binary';
  status: number;
  statusText: string;
  message?: string | undefined;
  data: unknown | undefined;
}

/**
 * Set a fetch request.
 */
interface SetFetch {
  get: (url: string) => Promise<FetchResponse>;
  // post: (url: string, data: unknown) => Promise<FetchResponse>;
  cancel: () => void;
  status: (callback?: (state: FetchState) => void) => FetchState | (() => void);
}

/**
 * Fetch operation error. Extends the standard `Error`.
 * Includes additional properties (e.g., HTTP status code, status text, cancellation flag).
 *
 * @extends Error
 * @class
 */
class FetchError extends Error {
  override readonly name = 'FetchError';
  readonly status?: number | undefined;
  readonly statusText?: string | undefined;
  override readonly cause?: unknown | undefined;
  readonly cancelled: boolean;

  /**
   * Fetch error details.
   *
   * @param options - Error options.
   * @param options.message - Error message.
   * @param options.status - HTTP status code.
   * @param options.statusText - HTTP status text.
   * @param options.cause - Cause of the error.
   * @param options.cancelled - Indicates if the fetch operation was canceled.
   */
  constructor(options: {
    message: string;
    status?: number | undefined;
    statusText?: string | undefined;
    cause?: unknown | undefined;
    cancelled?: boolean | undefined;
  }) {
    super(options.message);

    this.status = options.status;
    this.statusText = options.statusText;
    this.cause = options.cause;
    this.cancelled = options.cancelled ?? false;
  }
}

/**
 * Parse a Blob object into the MIME type format.
 *
 * @param params - Parameter options.
 * @param params.blob - The Blob object containing the payload to parse.
 * @param params.mimeType - The MIME type of the data contained in the blob.
 * @param {GlobalOptions} [options=getOptions()] - Configuration options for the fetch operation.
 * @returns {Promise<{ type: 'json' | 'text' | 'binary'; data: unknown }>} A Promise that
 *     resolves to an object containing the type of parsed data (`'json'`, `'text'`, or `'binary'`)
 *     and the corresponding data.
 *
 * @throws {FetchError} Throws an error if binary data processing is not allowed and the MIME
 *     type does not correspond to JSON or text formats.
 */
const parsePayload = async (
  { blob, mimeType }: { blob: Blob; mimeType: string },
  options = getOptions()
): Promise<{ type: 'json' | 'text' | 'binary'; data: unknown }> => {
  let updatedMimeType = mimeType.trim().toLowerCase();

  if (updatedMimeType.includes('application/json') || updatedMimeType.includes('+json')) {
    const text = await blob.text();

    return { type: 'json', data: text ? JSON.parse(text) : null };
  }

  /*
  if (updatedMimeType === 'application/octet-stream' || updatedMimeType === '') {
    // Read the first 4 bytes without loading the whole file
    const buffer = await blob.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Check if every byte in our sample falls within common printable text ranges
    // Range 32-126: standard ASCII (letters, numbers, punctuation, spaces)
    // Values 9, 10, 13: Tabs (\t), Line Feeds (\n), and Carriage Returns (\r)
    const looksLikeText = bytes.length === 0 ||
      bytes.every(byte => (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13);

    if (!looksLikeText) {
      // It contains non-printable binary garbage, flag it as actual binary data
      updatedMimeType = 'application/x-confirmed-binary';
    }
  }
  */
  if (updatedMimeType === 'application/octet-stream' || updatedMimeType === '') {
    // Peek at the first 4 bytes
    const buffer = await blob.slice(0, 4).arrayBuffer();
    const b = new Uint8Array(buffer);

    // --- IMAGE SIGNATURES ---
    const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const isGif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38; // GIF8
    const isWebp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46; // RIFF (WebP container)
    const isBmp = b[0] === 0x42 && b[1] === 0x4d; // BM
    const isIco = b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00; // ICO icon file

    // --- FONT SIGNATURES ---
    const isWoff = b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x46; // wOFF
    const isWoff2 = b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32; // wOF2
    const isOtfOrTtf = (b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f) || // OTTO (OTF)
      (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00); // TrueType (TTF)

    // --- EVALUATE ---
    const isBinaryAsset = isPng || isJpeg || isGif || isWebp || isBmp || isIco || isWoff || isWoff2 || isOtfOrTtf;

    if (isBinaryAsset) {
      updatedMimeType = 'application/x-confirmed-binary';
    }
  }

  if (updatedMimeType.startsWith('text/') ||
    updatedMimeType.includes('application/javascript') ||
    updatedMimeType.includes('application/xml') ||
    updatedMimeType.includes('application/x-ndjson') ||
    updatedMimeType.includes('application/ndjson') ||
    updatedMimeType.includes('application/octet-stream') ||
    updatedMimeType.includes('image/svg+xml') ||
    updatedMimeType === '') {
    return { type: 'text', data: await blob.text() };
  }

  if (options.xhrFetch.allowBinary) {
    return { type: 'binary', data: URL.createObjectURL(blob) };
  }

  throw new FetchError({ message: `Binary data is not allowed (${updatedMimeType}).` });
};

/**
 * Continuously read chunks of data from a given stream reader. Optionally enforces a maximum data
 * size limit.
 *
 * @note Recursive by design. Each `await reader.read()` yields to the microtask queue.
 *
 * @param params - Parameter options.
 * @param params.stream - Stream used to read data chunks.
 * @param [params.totalSize] - Optional total size of the expected data to compute progress
 *     percentage.
 * @param params.onProgress - Callback invoked with the updated byte count and progress percentage
 *     whenever a new chunk is read.
 * @param params.maxSizeBytes - Optional maximum size in bytes to enforce for the accumulated data.
 * @returns {Promise<Uint8Array[]>} Promise that resolves with the accumulated chunks as an array of
 *     `Uint8Array` objects.
 *
 * @throws {FetchError} If the accumulated size exceeds the specified `maxSizeBytes`.
 */
const readChunks = async ({
  stream, totalSize, maxSizeBytes, onProgress
}: {
  // reader: ReadableStreamDefaultReader<Uint8Array>;
  stream: Readable;
  totalSize?: number | undefined;
  maxSizeBytes: number;
  onProgress: (bytes: number, progress?: number | undefined) => void;
}): Promise<Uint8Array[]> => {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  // No while(true), no recursion. Just standard async iteration.
  try {
    for await (const chunk of stream) {
      totalBytes += chunk.byteLength;

      if (maxSizeBytes && totalBytes > maxSizeBytes) {
        stream.destroy();
        throw new FetchError({ message: 'File download aborted: Size exceeded maximum limit.' });
      }

      chunks.push(chunk);

      const progress = totalSize ? Math.round((totalBytes / totalSize) * 100) : undefined;

      onProgress(totalBytes, progress);
    }
  } catch (err) {
    if (!stream.destroyed) {
      stream.destroy();
    }

    if (err instanceof FetchError) {
      throw err;
    }

    throw new FetchError({ message: `File download failed: ${formatUnknownError(err)}` });
  }

  return chunks;

  /*
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  const chunkCycle = async () => {
    const { done, value } = await reader.read();

    if (done) {
      return chunks;
    }

    totalBytes += value.byteLength;

    if (maxSizeBytes && totalBytes > maxSizeBytes) {
      await reader.cancel().catch(() => {});
      throw new FetchError({ message: 'File download aborted: Size exceeded maximum limit.' });
    }

    chunks.push(value);

    onProgress(totalBytes, totalSize ? Math.round((totalBytes / totalSize) * 100) : undefined);

    return chunkCycle();
  };

  return chunkCycle();
   */
};

/**
 * Create a fetch operation.
 *
 * @param {GlobalOptions} [options=getOptions()] - Configuration options for the fetch operation.
 * @returns {SetFetch} Fetch operations:
 *   - `get`: GET request callback to the specified URL.
 *   - `cancel`: Cancel callback for the fetch operation.
 *   - `status`: Callback for returning state or registering a state listener.
 */
const setFetch = (options = getOptions()): SetFetch => {
  const { maxSizeBytes, timeoutMs } = options.xhrFetch;

  const state: FetchState = { phase: 'idle', progress: 0, bytesReceived: 0 };
  const listeners = new Set<(s: FetchState) => void>();
  const cancelReason = new Error('Request cancelled');

  let controller: AbortController | undefined;
  // let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  // let stream: ReadableStream<Uint8Array> | Readable | undefined;
  let stream: Readable | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let inflight: { key: string; promise: Promise<FetchResponse> } | undefined;

  /**
   * Update state with the provided patch object; notify all listeners.
   *
   * @param {Partial<FetchState>} patch - Partial object containing updates to the state.
   */
  const updateState = (patch: Partial<FetchState>) => {
    Object.assign(state, patch);

    listeners.forEach(cb => {
      try {
        cb({ ...state });
      } catch (error) {
        log.debug('status callback error:', formatUnknownError(error));
      }
    });
  };

  /**
   * Prevent duplicating async tasks for the same key.
   *
   * @param {string} key - A unique identifier associated with the operation.
   * @param {() => Promise<FetchResponse>} startFetch - Start the async operation and return a promise.
   * @returns {Promise<FetchResponse>} Promise that resolves to the result of the async operation.
   *
   * @throws {FetchError} If an operation with the specified key is already in progress and a new
   *     task is attempted.
   */
  const checkInflight = (key: string, startFetch: () => Promise<FetchResponse>): Promise<FetchResponse> => {
    if (inflight) {
      if (inflight.key === key) {
        return inflight.promise;
      }

      return Promise.reject(new FetchError({ message: 'Fetch already in progress. Create a new setFetch.' }));
    }

    const promise = startFetch().finally(() => {
      inflight = undefined;
    });

    inflight = { key, promise };

    return promise;
  };

  /**
   * Execute a fetch request with the given URL and settings.
   *
   * @param url - URL to fetch.
   * @param settings - Optional settings for the fetch request.
   * @returns A Promise that resolves to the fetch response.
   */
  const executeFetch = async (url: string, settings: RequestInit = {}): Promise<FetchResponse> => {
    controller = new AbortController();
    timeoutId = setTimeout(
      () => controller?.abort(new Error(`Timeout: exceeded ${timeoutMs}ms.`)),
      timeoutMs
    );

    timeoutId.unref();

    updateState({ phase: 'loading', progress: 0, bytesReceived: 0, error: undefined, data: undefined, type: undefined });

    try {
      const response = await fetch(url, { ...settings, signal: controller.signal });

      if (!response.ok) {
        throw new FetchError({
          message: `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
          status: response.status,
          statusText: response.statusText
        });
      }

      const totalSize = Number(response.headers.get('content-length')) || undefined;

      if (totalSize && maxSizeBytes && totalSize > maxSizeBytes) {
        throw new FetchError({ message: `File blocked: exceeds ${maxSizeBytes} bytes.`, status: response.status, statusText: response.statusText });
      }

      stream = response.body ? Readable.fromWeb(response.body as ReadableStream<Uint8Array>) : undefined;
      const chunks = stream
        ? await readChunks({
          stream,
          totalSize,
          maxSizeBytes,
          onProgress: (bytesReceived, progress) => updateState({ bytesReceived, progress })
        })
        : [];

      const mimeType = response.headers.get('content-type') || '';
      const flattenedBuffer = [Buffer.concat(chunks)];
      const { type, data } = await parsePayload({ blob: new Blob(flattenedBuffer, { type: mimeType }), mimeType });
      const result: FetchResponse = { type, status: response.status, statusText: response.statusText, data };

      updateState({ phase: 'success', progress: 100, type, data });

      return result;
    } catch (error) {
      const cancelled = controller?.signal?.reason === cancelReason;

      const fetchError = error instanceof FetchError
        ? error
        : new FetchError({
          message: formatUnknownError(error),
          cause: error,
          cancelled
        });

      updateState({ phase: cancelled ? 'cancelled' : 'error', error: fetchError, message: fetchError.message });
      throw fetchError;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      stream = undefined;
      controller = undefined;
    }
  };

  return {
    get: (url: string) => {
      const key = `GET:${url}`;

      return checkInflight(key, () => executeFetch(url, { method: 'GET' }));
    },
    cancel: () => {
      if (state.phase !== 'loading') {
        return;
      }

      controller?.abort(cancelReason);
      // reader?.cancel().catch(() => {});
      if (!stream?.destroyed) {
        stream?.destroy();
      }
    },
    status: (callback?: (state: FetchState) => void) => {
      if (typeof callback === 'function') {
        listeners.add(callback);
        callback({ ...state });

        return () => {
          listeners.delete(callback);
        };
      }

      return { ...state };
    }
  };
};

export { setFetch, FetchError, type FetchState, type FetchResponse, type SetFetch };

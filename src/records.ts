import { type GlobalOptions } from './options';
import { getOptions } from './options.context.js';
import { log } from './logger.js';
import { spawnApiHost, sendApiHostShutdown, type HostHandle } from './records.patternFly.js';

/**
 * Record schema.
 *
 * @interface Record
 *
 * @property sourceId - Source identifier (e.g., combo of git-hash + file path, or crawler endpoint)
 * @property sourceType - Source type classification
 * @property id - Unique id for the record
 */
interface Record {
  sourceId: string;
  sourceType: 'git' | 'api' | 'local';
  id: string;
  [customField: string]: unknown;
}

/**
 * Standard callback return structure for records collection.
 *
 * @interface RecordCollectionResult
 *
 * @property records - Array of records
 * @property warnings - Optional array of warnings
 * @property errors - Optional array of errors
 */
interface RecordCollectionResult {
  records: Record[];
  warnings?: string[];
  errors?: string[];
}

/**
 * Standardized Tuple-based Record Source.
 *
 * 0. `name` `{string}`: Unique identifier/name
 * 1. `handler` `{Function}`: callback function accepting an optional argument
 * 2. `_config` `{Object}`: Record source configuration.
 *    - `_config.runInChildProcess`: Optional callback function to dynamically decide
 *        if the record source should run in a child process.
 */
type RecordSource = [
  name: string,
  handler: (arg?: unknown) => RecordCollectionResult | Promise<RecordCollectionResult>,
  _config?: {
    runInChildProcess?: (options: GlobalOptions) => boolean | Promise<boolean>;
  }
];

/**
 * Dynamically proxies a remote child-process record callback across the IPC boundary.
 *
 * @param sourceName
 * @param handle
 * @param globalOpts
 */
const makeProxyRecordHandler = (
  sourceName: string,
  handle: HostHandle,
  globalOpts: GlobalOptions
): (arg?: unknown) => Promise<RecordCollectionResult> => {
  const invokeTimeoutMs = Math.max(0, Number(globalOpts.pluginHost?.invokeTimeoutMs) || 0);

  return async arg => {
    try {
      const response = await handle.request<any>(
        {
          t: 'invoke',
          toolId: 'crawl',
          args: { sourceName, arg }
        },
        'invoke:result',
        invokeTimeoutMs
      );

      if (response.ok) {
        return {
          records: response.result?.records || [],
          warnings: response.result?.warnings || [],
          errors: response.result?.errors || []
        };
      } else {
        return {
          records: [],
          errors: [response.error?.message || `Proxy call failed for ${sourceName}`]
        };
      }
    } catch (err) {
      return {
        records: [],
        errors: [`Proxy connection failed for ${sourceName}: ${err instanceof Error ? err.message : String(err)}`]
      };
    }
  };
};

/**
 * Composes multi-source record collections across process boundaries.
 *
 * @param sources
 * @param options
 */
const composePatternFly = async (
  sources: RecordSource[],
  options: GlobalOptions = getOptions()
): Promise<RecordCollectionResult> => {
  const records: Record[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const inProcess: RecordSource[] = [];
  const outOfProcess: RecordSource[] = [];

  // Segment based on dynamic execution boundary check
  for (const source of sources) {
    const [, , config] = source;
    const runRemote = config?.runInChildProcess ? await config.runInChildProcess(options) : false;

    if (runRemote) {
      outOfProcess.push(source);
    } else {
      inProcess.push(source);
    }
  }

  // 1. Run local / in-process callbacks directly
  for (const [name, handler] of inProcess) {
    try {
      const result = await handler();

      if (result.records) {
        records.push(...result.records);
      }

      if (result.warnings) {
        warnings.push(...result.warnings);
      }

      if (result.errors) {
        errors.push(...result.errors);
      }
    } catch (err) {
      errors.push(`Local source [${name}] failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Spawn records host dynamically ONLY if remote runs are required
  if (outOfProcess.length > 0) {
    let handle: HostHandle | undefined;

    try {
      handle = await spawnApiHost(options);

      for (const [name] of outOfProcess) {
        try {
          const remoteProxy = makeProxyRecordHandler(name, handle, options);
          const result = await remoteProxy();

          if (result.records) {
            records.push(...result.records);
          }

          if (result.warnings) {
            warnings.push(...result.warnings);
          }

          if (result.errors) {
            errors.push(...result.errors);
          }
        } catch (err) {
          errors.push(`Remote source [${name}] failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (spawnError) {
      errors.push(`Failed to spin up process host: ${spawnError instanceof Error ? spawnError.message : String(spawnError)}`);
    } finally {
      if (handle) {
        await sendApiHostShutdown(options).catch(err =>
          log.warn(`shutdown after compose failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  }

  return { records, warnings, errors };
};

export {
  composePatternFly,
  makeProxyRecordHandler,
  type Record,
  type RecordCollectionResult,
  type RecordSource
};

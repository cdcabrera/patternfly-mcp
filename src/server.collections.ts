import { type McpCollection, type McpCollectionCreator, type McpCollectionResult } from './collections';
import { type AppSession, type GlobalOptions } from './options';
import { getOptions, getSessionOptions } from './options.context';
import { heavyPool } from './server.workerPool';
import { deferTask } from './server.task';

type CollectionRunSchedule = NonNullable<McpCollection[2]>['runSchedule'];

/**
 * Recreates a creator function to proxy task execution through the global worker thread pool.
 *
 * @param {McpCollectionCreator} creator - The original creator.
 * @param {string} moduleSpecifier - The ESM import specifier to load in the worker.
 * @param {GlobalOptions} options - Global options.
 * @param {string} exportName - The name of the export to invoke in the worker module. Defaults to 'default'.
 * @returns {McpCollectionCreator} The proxied creator function.
 */
const makeParallelProxyCreator = ({
  creator,
  moduleSpecifier,
  exportName = 'default'
}: { creator: McpCollectionCreator, moduleSpecifier: string, exportName?: string },
options: GlobalOptions = getOptions()): McpCollectionCreator => () => {
  const [name] = creator(options);

  const handler = async (args?: unknown): Promise<McpCollectionResult> => {
    const currentOptions = getOptions();
    const currentSession = getSessionOptions();

    return heavyPool.runTask<McpCollectionResult>({
      moduleSpecifier,
      exportName,
      args,
      options: currentOptions,
      session: currentSession
    });
  };

  return [name, handler];
};

/**
 * Recreates a creator function to wrap task execution in a deferred task, guarding
 * long-running collection callbacks with per-execution timeout and hard cancel cutoffs.
 *
 * @param {McpCollectionCreator} creator - The original creator.
 * @param {CollectionRunSchedule} runSchedule - Schedule config sourced from the
 *     collection's `_config.runSchedule`. Provides `cancelMs` and `intervalMs`
 *     used to build the underlying {@link deferTask}.
 * @param {GlobalOptions} options - Global options.
 * @returns {McpCollectionCreator} The proxied creator function.
 */
const makeScheduledProxyCreator = ({
  creator,
  runSchedule
}: { creator: McpCollectionCreator, runSchedule: CollectionRunSchedule },
options: GlobalOptions = getOptions()): McpCollectionCreator => () => {
  const [name, callback, config] = creator(options);
  const deferOptions = {
    ...(typeof runSchedule?.cancelMs === 'number' ? { cancelMs: runSchedule.cancelMs } : {}),
    ...(typeof runSchedule?.intervalMs === 'number' ? { intervalMs: runSchedule.intervalMs } : {})
  };

  const handler = async (args?: unknown): Promise<McpCollectionResult> => {
    const task = deferTask(callback, deferOptions)(args);

    return (await task.start()) ?? { records: [] };
  };

  return config ? [name, handler, config] : [name, handler];
};

/**
 * Composes multi-source record collections across process boundaries.
 *
 * @param {McpCollectionCreator[]} builtinCreators - Built-in collection creators.
 * @param {GlobalOptions} options - Global options.
 * @param {AppSession} _session - Session options.
 * @returns {Promise<McpCollectionCreator[]>} Promise array of collection creators.
 */
const composeCollections = async (
  builtinCreators: McpCollectionCreator[],
  options: GlobalOptions = getOptions(),
  _session: AppSession = getSessionOptions()
): Promise<McpCollectionCreator[]> => {
  const localCreators: McpCollectionCreator[] = [];

  // Wrap built-in creators to enforce trusted _isInternal. Ties into what options, session values are available.
  const securedBuiltinCreators = builtinCreators.map((creator): McpCollectionCreator => opt => {
    const [name, callback, config] = creator(opt);

    return [
      name,
      callback,
      {
        ...config,
        _isInternal: true
      }
    ];
  });

  if (securedBuiltinCreators.length === 0) {
    return [];
  }

  for (const creator of securedBuiltinCreators) {
    const [, , config] = creator(options);
    const runHostValue = config?.runParallel as unknown;
    const runScheduleConfig = config?.runSchedule;
    let updatedCreator = creator;

    if (typeof runHostValue === 'string' && runHostValue.startsWith('#')) {
      // Use 'collectionCallback' for collection modules that expose a common-named export.
      updatedCreator = makeParallelProxyCreator({ creator, moduleSpecifier: runHostValue, exportName: 'collectionCallback' });
    }

    // Layer scheduling on top of the (optional) parallel wrap so the defer-task
    // guardrails apply to the entire execution, including any worker-pool proxy.
    if (runScheduleConfig && typeof runScheduleConfig === 'object') {
      updatedCreator = makeScheduledProxyCreator({ creator: updatedCreator, runSchedule: runScheduleConfig });
    }

    localCreators.push(updatedCreator);
  }

  return localCreators;
};

export {
  composeCollections
};

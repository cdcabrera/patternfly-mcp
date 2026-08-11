import { type McpCollectionCreator, type McpCollectionResult } from './collections';
import { type AppSession, type GlobalOptions } from './options';
import { getOptions, getSessionOptions } from './options.context';
import { heavyPool } from './server.workerPool';

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
    let updatedCreator = creator;

    if (typeof runHostValue === 'string' && runHostValue.startsWith('#')) {
      // Use 'runCollection' for collection modules that expose that named export.
      updatedCreator = makeParallelProxyCreator({ creator, moduleSpecifier: runHostValue, exportName: 'runCollection' });
    }

    localCreators.push(updatedCreator);
  }

  return localCreators;
};

export {
  composeCollections
};

import { type McpResourceCreator } from './server';
import { type AppSession, type GlobalOptions } from './options';
import { getOptions, getSessionOptions } from './options.context';

/**
 * Compose built-in resource creators.
 *
 * @param builtinCreators - Built-in tool creators
 * @param {GlobalOptions} _options - Global options.
 * @param {AppSession} _sessionOptions - Session options.
 * @returns {Promise<McpResourceCreator[]>} Promise array of tool creators
 */
const composeResources = async (
  builtinCreators: McpResourceCreator[],
  _options: GlobalOptions = getOptions(),
  _sessionOptions: AppSession = getSessionOptions()
): Promise<McpResourceCreator[]> => [...builtinCreators];

export { composeResources };

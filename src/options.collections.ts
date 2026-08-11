import { type GlobalOptions } from './options';
import { type ToolOptions, setToolOptions } from './options.tools';

/**
 * Options for records. A limited subset of options.
 */
type CollectionOptions = ToolOptions & {
  mode: GlobalOptions['mode'];
  modeOptions: GlobalOptions['modeOptions'];
  patternflyOptions: GlobalOptions['patternflyOptions'];
  minMax: GlobalOptions['minMax'];
  whitelist: GlobalOptions['whitelist'];
  xhrFetch: GlobalOptions['xhrFetch'];
  docsPaths: GlobalOptions['docsPaths'];
  docsPathSlug: GlobalOptions['docsPathSlug'];
  contextPath: GlobalOptions['contextPath'];
  contextUrl: GlobalOptions['contextUrl'];
};

/**
 * Return a refined set of options from global options for records.
 *
 * @param {GlobalOptions} options - Minimal set of options required for collections.
 * @returns {CollectionOptions}
 */
const setCollectionOptions = (options: GlobalOptions): CollectionOptions => ({
  ...setToolOptions(options),
  mode: options.mode,
  modeOptions: options.modeOptions,
  patternflyOptions: options.patternflyOptions,
  minMax: options.minMax,
  whitelist: options.whitelist,
  xhrFetch: options.xhrFetch,
  docsPaths: options.docsPaths,
  docsPathSlug: options.docsPathSlug,
  contextPath: options.contextPath,
  contextUrl: options.contextUrl
});

export { setCollectionOptions, type CollectionOptions };

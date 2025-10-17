import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PluginModule, PluginContext } from './types';
import type { McpToolCreator } from './server';

/**
 * Determine if a plugin path is local or npm package
 *
 * Simple heuristic: if it starts with ./ ../ / ~/ or C:\ it's local
 * Otherwise assume npm package (actual check happens in loadPlugin)
 *
 * @param pluginPath - Plugin path to check
 * @returns True if local path, false if npm package
 */
const isLocalPath = (pluginPath: string): boolean =>
  pluginPath.startsWith('./') ||
  pluginPath.startsWith('../') ||
  pluginPath.startsWith('/') ||
  pluginPath.startsWith('~/') ||
  /^[a-z]:\\/i.test(pluginPath); // Windows C:\ D:\ etc

/**
 * Resolve and load a plugin
 *
 * Attempts to:
 * 1. Resolve as local file (existsSync) or npm package (require.resolve)
 * 2. Import and validate exports
 * 3. Call factory and validate tool creator
 * 4. Return tool creator or null if failed
 *
 * @param pluginPath - Plugin path or npm package name
 * @param context - Plugin context with utilities and config
 * @param options - Loading options
 * @param options.verbose - Enable verbose logging
 * @returns Tool creator function or null if failed
 */
const loadPlugin = async (
  pluginPath: string,
  context: PluginContext,
  { verbose = false }: { verbose?: boolean } = {}
): Promise<McpToolCreator | null> => {
  try {
    // Step 1: Resolve plugin path
    let resolvedPath: string;

    if (isLocalPath(pluginPath)) {
      // Local file: check existence
      resolvedPath = resolve(pluginPath);

      if (!existsSync(resolvedPath)) {
        throw new Error(`Local plugin file not found: ${resolvedPath}`);
      }

      if (verbose) {
        console.info(`  → Resolved as local file: ${resolvedPath}`);
      }
    } else {
      // npm package: use require.resolve
      try {
        resolvedPath = require.resolve(pluginPath, {
          paths: [process.cwd(), ...module.paths]
        });

        if (verbose) {
          console.info(`  → Resolved as npm package: ${resolvedPath}`);
        }
      } catch {
        throw new Error(`npm package not found: ${pluginPath}. Make sure it's installed with npm/pnpm/yarn.`);
      }
    }

    // Step 2: Import the plugin module
    let pluginModule: PluginModule;

    try {
      // Use file:// protocol for Windows compatibility
      const importPath = `file://${resolvedPath}`;

      pluginModule = await import(importPath) as PluginModule;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to import plugin: ${error.message}`);
      }

      throw error;
    }

    // Step 3: Validate default export (factory function)
    if (!pluginModule.default) {
      throw new Error('Plugin must export a default factory function');
    }

    if (typeof pluginModule.default !== 'function') {
      throw new Error(`Plugin default export must be a function, got: ${typeof pluginModule.default}`);
    }

    // Step 4: Call factory with context
    let toolCreator: McpToolCreator;

    try {
      toolCreator = pluginModule.default(context);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Plugin factory threw error: ${error.message}`);
      }

      throw error;
    }

    // Step 5: Validate tool creator
    if (typeof toolCreator !== 'function') {
      throw new Error(`Plugin factory must return a function (tool creator), got: ${typeof toolCreator}`);
    }

    // Step 6: Call tool creator and validate tuple structure
    let toolTuple;

    try {
      toolTuple = toolCreator();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Tool creator threw error: ${error.message}`);
      }

      throw error;
    }

    if (!Array.isArray(toolTuple) || toolTuple.length !== 3) {
      throw new Error(`Tool creator must return [name, schema, callback] tuple, got: ${typeof toolTuple}`);
    }

    const [name, schema, callback] = toolTuple;

    if (!name || typeof name !== 'string') {
      throw new Error(`Tool name must be a non-empty string, got: ${typeof name}`);
    }

    if (!schema || typeof schema !== 'object') {
      throw new Error(`Tool schema must be an object, got: ${typeof schema}`);
    }

    if (typeof callback !== 'function') {
      throw new Error(`Tool callback must be a function, got: ${typeof callback}`);
    }

    // Success!
    console.info(`✅ Loaded plugin: ${pluginPath} → ${name}`);

    if (verbose && pluginModule.metadata) {
      console.info(`   Metadata: ${JSON.stringify(pluginModule.metadata, null, 2)}`);
    }

    if (verbose && callback.toString) {
      const signature = callback.toString().split('\n')[0];

      console.info(`   Callback signature: ${signature}`);
    }

    return toolCreator;
  } catch (error) {
    // Non-fatal: log error and return null
    console.error(`❌ Failed to load plugin: ${pluginPath}`);

    if (error instanceof Error) {
      console.error(`   Reason: ${error.message}`);

      if (verbose && error.stack) {
        console.error(`   Stack: ${error.stack}`);
      }
    }

    return null;
  }
};

export { loadPlugin, isLocalPath };


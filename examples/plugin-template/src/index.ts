/**
 * PatternFly MCP Tool Plugin Template
 * 
 * This is a template for creating PatternFly MCP tool plugins.
 * Follow the instructions in comments to customize for your use case.
 * 
 * @see https://github.com/patternfly/patternfly-mcp - Main repository
 * @see .agent/plugins/04-authoring-guide.md - Plugin authoring guide
 * @see .agent/plugins/05-api-reference.md - API reference
 */

import { z } from 'zod';
import type {
  PluginFactory,
  PluginContext,
  ToolCallbackArgs,
  ToolCallbackResponse
} from '@jephilli-patternfly-docs/mcp/types';

/**
 * Plugin factory function
 * 
 * This is the main entry point for your plugin. It receives a context object
 * with utilities and configuration, and returns a tool creator function.
 * 
 * @param context - Plugin context with utils, config, logger, and types
 * @returns Tool creator function
 */
const myPlugin: PluginFactory = (context: PluginContext) => {
  // Destructure context for easy access
  const { utils, config, logger, types } = context;
  
  // ========================================================================
  // PLUGIN INITIALIZATION
  // ========================================================================
  // This code runs once when the plugin is loaded.
  // Use it to:
  // - Initialize caches or connections
  // - Validate plugin options
  // - Setup memoized functions
  // - Log plugin load information
  // ========================================================================
  
  logger.info(`Template plugin loaded for ${config.serverName} v${config.serverVersion}`);
  
  // Get plugin-specific options from config file (if any)
  const pluginOptions = config.pluginOptions || {};
  const cacheLimit = pluginOptions.cacheLimit || 50;
  const debugMode = pluginOptions.debug || false;
  
  if (debugMode) {
    logger.debug('Plugin options:', pluginOptions);
  }
  
  // Example: Create a memoized function for expensive operations
  const expensiveOperation = utils.memo(
    async (input: string): Promise<string> => {
      // Simulate expensive operation
      logger.info(`Processing input: ${input}`);
      
      // Your actual logic here
      // For example: API calls, data processing, file parsing, etc.
      const result = `Processed: ${input}`;
      
      return result;
    },
    {
      cacheLimit,
      expire: 5 * 60 * 1000, // 5 minutes
      cacheErrors: false
    }
  );
  
  // ========================================================================
  // TOOL CREATOR
  // ========================================================================
  // This function returns a tuple that defines your MCP tool.
  // It runs once when the server registers the tool.
  // ========================================================================
  
  return () => {
    // ======================================================================
    // TOOL CALLBACK
    // ======================================================================
    // This is the function that handles tool execution.
    // It receives validated arguments and returns a response.
    // ======================================================================
    
    const callback = async (args: ToolCallbackArgs): Promise<ToolCallbackResponse> => {
      // Extract and type-cast arguments
      // The MCP SDK validates args against inputSchema before calling this
      const { input, options } = args as {
        input: string;
        options?: {
          format?: 'text' | 'json';
          verbose?: boolean;
        };
      };
      
      // Log the request (in debug mode)
      if (debugMode) {
        logger.debug('Tool called with args:', args);
      }
      
      // ------------------------------------------------------------------
      // VALIDATION
      // ------------------------------------------------------------------
      // Add any additional validation beyond Zod schema
      // Use McpError for standardized error responses
      // ------------------------------------------------------------------
      
      if (!input || input.trim().length === 0) {
        throw new types.McpError(
          types.ErrorCode.InvalidParams,
          'input parameter is required and cannot be empty'
        );
      }
      
      // ------------------------------------------------------------------
      // PROCESSING
      // ------------------------------------------------------------------
      // Your main tool logic goes here
      // Use context utilities for common operations:
      // - utils.fetchUrl() for HTTP requests
      // - utils.readFile() for file reading
      // - utils.memo() for caching expensive operations
      // ------------------------------------------------------------------
      
      try {
        // Example: Use the memoized function
        const result = await expensiveOperation(input);
        
        // Example: Format the result based on options
        const format = options?.format || 'text';
        const formattedResult = format === 'json'
          ? JSON.stringify({ result, input }, null, 2)
          : result;
        
        // ------------------------------------------------------------------
        // RESPONSE
        // ------------------------------------------------------------------
        // Return response in MCP format
        // Always include a content array with at least one item
        // ------------------------------------------------------------------
        
        return {
          content: [
            {
              type: 'text',
              text: formattedResult
            }
          ],
          // Optional: Add metadata for debugging or tracking
          metadata: {
            cached: false, // Track if result was cached
            processingTime: 0 // Track processing time
          }
        };
      } catch (error) {
        // ------------------------------------------------------------------
        // ERROR HANDLING
        // ------------------------------------------------------------------
        // Wrap errors in McpError for standardized responses
        // Log errors for debugging
        // ------------------------------------------------------------------
        
        logger.error('Tool execution failed:', error);
        
        throw new types.McpError(
          types.ErrorCode.InternalError,
          `Failed to process input: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { originalError: error }
        );
      }
    };
    
    // ======================================================================
    // TOOL REGISTRATION
    // ======================================================================
    // Return a tuple: [name, schema, callback]
    // - name: Unique tool identifier (string)
    // - schema: Tool description and input schema (Zod)
    // - callback: Async function that handles execution
    // ======================================================================
    
    return [
      // Tool name - must be unique across all plugins
      'myTool',
      
      // Tool schema - describes the tool and its inputs
      {
        description: 'Example tool from template. Replace with your tool description. ' +
                     'This description is used by AI assistants to understand when and how to use your tool.',
        inputSchema: {
          // Define input parameters using Zod
          // Add .describe() for each parameter to help AI assistants
          input: z.string()
            .min(1)
            .describe('The input string to process'),
          
          options: z.object({
            format: z.enum(['text', 'json'])
              .optional()
              .describe('Output format (default: text)'),
            
            verbose: z.boolean()
              .optional()
              .describe('Enable verbose output')
          })
            .optional()
            .describe('Optional configuration')
        }
      },
      
      // Tool callback - handles execution
      callback
    ];
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Default export: Plugin factory
 * This is required - the plugin loader looks for this export
 */
export default myPlugin;

/**
 * Optional: Plugin metadata
 * Export this to provide additional information about your plugin
 */
export const metadata = {
  name: '@patternfly/mcp-tool-template',
  version: '1.0.0',
  description: 'Template for creating PatternFly MCP tool plugins',
  author: 'Your Name',
  homepage: 'https://github.com/patternfly/mcp-tool-template'
};


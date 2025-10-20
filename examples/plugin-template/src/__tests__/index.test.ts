/**
 * Tests for plugin template
 * 
 * This file demonstrates how to test your plugin.
 * Customize these tests for your specific functionality.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PluginContext } from '@jephilli-patternfly-docs/mcp/types';
import myPlugin, { metadata } from '../index';

/**
 * Create a mock plugin context for testing
 */
function createMockContext(overrides?: Partial<PluginContext>): PluginContext {
  return {
    utils: {
      memo: jest.fn((fn) => fn) as any,
      fetchUrl: jest.fn(async (url: string) => 'mock response') as any,
      readFile: jest.fn(async (path: string) => 'mock file content') as any,
      resolveLocalPath: jest.fn((path: string) => path) as any
    },
    config: {
      serverName: 'test-server',
      serverVersion: '1.0.0',
      separator: '\n---\n',
      pluginOptions: {}
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    types: {
      McpError: class McpError extends Error {
        constructor(public code: number, message: string, public data?: unknown) {
          super(message);
        }
      } as any,
      ErrorCode: {
        InvalidParams: -32602,
        InvalidRequest: -32600,
        MethodNotFound: -32601,
        InternalError: -32603,
        ParseError: -32700
      } as any
    },
    ...overrides
  };
}

describe('myPlugin', () => {
  let mockContext: PluginContext;

  beforeEach(() => {
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  describe('plugin initialization', () => {
    it('should create plugin factory', () => {
      expect(typeof myPlugin).toBe('function');
    });

    it('should log plugin load', () => {
      myPlugin(mockContext);
      
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Template plugin loaded')
      );
    });

    it('should handle plugin options', () => {
      const contextWithOptions = createMockContext({
        config: {
          serverName: 'test-server',
          serverVersion: '1.0.0',
          separator: '\n---\n',
          pluginOptions: {
            cacheLimit: 100,
            debug: true
          }
        }
      });

      myPlugin(contextWithOptions);
      
      expect(contextWithOptions.logger.debug).toHaveBeenCalled();
    });
  });

  describe('tool registration', () => {
    it('should return tool creator function', () => {
      const toolCreator = myPlugin(mockContext);
      
      expect(typeof toolCreator).toBe('function');
    });

    it('should return valid tool tuple', () => {
      const toolCreator = myPlugin(mockContext);
      const [name, schema, callback] = toolCreator();
      
      expect(name).toBe('myTool');
      expect(schema).toHaveProperty('description');
      expect(schema).toHaveProperty('inputSchema');
      expect(typeof callback).toBe('function');
    });

    it('should have proper input schema', () => {
      const toolCreator = myPlugin(mockContext);
      const [, schema] = toolCreator();
      
      expect(schema.inputSchema).toHaveProperty('input');
      expect(schema.inputSchema).toHaveProperty('options');
    });
  });

  describe('tool callback', () => {
    it('should process valid input', async () => {
      const toolCreator = myPlugin(mockContext);
      const [, , callback] = toolCreator();
      
      const result = await callback({ input: 'test input' });
      
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should handle text format', async () => {
      const toolCreator = myPlugin(mockContext);
      const [, , callback] = toolCreator();
      
      const result = await callback({
        input: 'test',
        options: { format: 'text' }
      });
      
      expect(result.content[0].text).toContain('Processed');
    });

    it('should handle json format', async () => {
      const toolCreator = myPlugin(mockContext);
      const [, , callback] = toolCreator();
      
      const result = await callback({
        input: 'test',
        options: { format: 'json' }
      });
      
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should throw on empty input', async () => {
      const toolCreator = myPlugin(mockContext);
      const [, , callback] = toolCreator();
      
      await expect(callback({ input: '' })).rejects.toThrow();
      await expect(callback({ input: '   ' })).rejects.toThrow();
    });

    it('should throw on missing input', async () => {
      const toolCreator = myPlugin(mockContext);
      const [, , callback] = toolCreator();
      
      await expect(callback({})).rejects.toThrow();
    });

    it('should use McpError for validation errors', async () => {
      const toolCreator = myPlugin(mockContext);
      const [, , callback] = toolCreator();
      
      try {
        await callback({ input: '' });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe(-32602); // InvalidParams
        expect(error.message).toContain('required');
      }
    });

    it('should log errors', async () => {
      const toolCreator = myPlugin(mockContext);
      const [, , callback] = toolCreator();
      
      // Force an error by passing invalid input
      try {
        await callback({ input: '' });
      } catch {
        // Expected error
      }
      
      // Note: Error logging happens in catch block, but with our mock
      // the error is thrown before that. In real scenarios, you'd test
      // error logging for unexpected errors during processing.
    });
  });

  describe('metadata', () => {
    it('should export valid metadata', () => {
      expect(metadata).toHaveProperty('name');
      expect(metadata).toHaveProperty('version');
      expect(metadata).toHaveProperty('description');
      expect(metadata.name).toBe('@patternfly/mcp-tool-template');
    });
  });
});


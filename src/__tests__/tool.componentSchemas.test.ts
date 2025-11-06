import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentSchemasTool } from '../tool.componentSchemas';

// Mock dependencies
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

describe('componentSchemasTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = componentSchemasTool();

    expect(tool).toMatchSnapshot('structure');
  });
});

describe('componentSchemasTool, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      componentName: 'Button'
    },
    {
      description: 'with trimmed componentName',
      componentName: ' Button  '
    },
    {
      description: 'with lower case componentName',
      componentName: 'button'
    },
    {
      description: 'with upper case componentName',
      componentName: 'BUTTON'
    }
  ])('should parse parameters, $description', async ({ componentName }) => {
    const [_name, _schema, callback] = componentSchemasTool();
    const result = await callback({ componentName });

    expect(result).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with missing or undefined componentName',
      error: 'Missing required parameter: componentName',
      componentName: undefined
    },
    {
      description: 'with null componentName',
      error: 'Missing required parameter: componentName',
      componentName: null
    },
    {
      description: 'with non-string componentName',
      error: 'Missing required parameter: componentName',
      componentName: 123
    },
    {
      description: 'with non-existent component',
      error: 'Component "NonExistentComponent" not found',
      componentName: 'NonExistentComponent'
    }
  ])('should handle errors, $description', async ({ error, componentName }) => {
    const [_name, _schema, callback] = componentSchemasTool();

    await expect(callback({ componentName })).rejects.toThrow(McpError);
    await expect(callback({ componentName })).rejects.toThrow(error);
  });
});


// Additional tests for componentSchemasTool behavior after fuzzySearch refactor

describe('componentSchemasTool, suggestions and error flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers short suggestions for empty string (last-resort fuzzy), then not found', async () => {
    // Re-mock memo to passthrough
    jest.resetModules();
    jest.doMock('../server.caching', () => ({
      memo: jest.fn((fn: any) => fn)
    }));

    // Provide a small set of short names to ensure suggestions exist with empty query
    jest.doMock('@patternfly/patternfly-component-schemas/json', () => ({
      componentNames: ['A', 'AB', 'ABC', 'ABCD'],
      getComponentSchema: (name: string) => ({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        title: name,
        description: '',
        properties: {}
      })
    }), { virtual: true });

    const mod = await import('../tool.componentSchemas');
    const [_name, _schema, callback] = mod.componentSchemasTool();

    await expect(callback({ componentName: '' })).rejects.toThrow('Component "" not found');
    await expect(callback({ componentName: '' })).rejects.toThrow('Did you mean');
  });

  it('caps suggestions to three items in the error message', async () => {
    jest.resetModules();
    jest.doMock('../server.caching', () => ({ memo: jest.fn((fn: any) => fn) }));

    // 5 short names → with empty query and maxDistance=3, only 4 with length <= 3 should qualify.
    // Ensure more than 3 potential candidates so capping to 3 is observable.
    jest.doMock('@patternfly/patternfly-component-schemas/json', () => ({
      componentNames: ['A', 'AB', 'ABC', 'ABD', 'ABCDE'],
      getComponentSchema: (name: string) => ({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        title: name,
        description: '',
        properties: {}
      })
    }), { virtual: true });

    const mod = await import('../tool.componentSchemas');
    const [_name, _schema, callback] = mod.componentSchemasTool();

    try {
      await callback({ componentName: '' });
    } catch (err: any) {
      const msg: string = err?.message || '';
      // Count the number of quoted suggestion strings in the message
      const matches = msg.match(/"[^"]+"/g) || [];
      expect(matches.length).toBeLessThanOrEqual(3);
    }
  });

  it('deduplicates suggestions by normalized value (e.g., Résumé vs resume)', async () => {
    jest.resetModules();
    jest.doMock('../server.caching', () => ({ memo: jest.fn((fn: any) => fn) }));

    jest.doMock('@patternfly/patternfly-component-schemas/json', () => ({
      componentNames: ['Résumé', 'resume', 'Resume'],
      getComponentSchema: (name: string) => ({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        title: name,
        description: '',
        properties: {}
      })
    }), { virtual: true });

    const mod = await import('../tool.componentSchemas');
    const [_name, _schema, callback] = mod.componentSchemasTool();

    try {
      await callback({ componentName: 'resu' });
    } catch (err: any) {
      const msg: string = err?.message || '';
      const suggestions = (msg.match(/"[^"]+"/g) || []).map(s => s.replace(/"/g, ''));
      // Ensure only one normalized suggestion is shown
      const lower = suggestions.map(s => s.toLowerCase());
      expect(new Set(lower).size).toBe(1);
    }
  });

  it('surfaces InternalError when schema fetch fails on an exact match', async () => {
    jest.resetModules();
    jest.doMock('../server.caching', () => ({ memo: jest.fn((fn: any) => fn) }));

    jest.doMock('@patternfly/patternfly-component-schemas/json', () => ({
      componentNames: ['Button'],
      getComponentSchema: (_name: string) => { throw new Error('boom'); }
    }), { virtual: true });

    const mod = await import('../tool.componentSchemas');
    const [_name, _schema, callback] = mod.componentSchemasTool();

    await expect(callback({ componentName: 'Button' })).rejects.toThrow('Failed to fetch component schema:');
  });
});

// Mock the PatternFly schemas module since it uses ES modules
jest.mock('@patternfly/patternfly-component-schemas', () => ({
  componentNames: ['Button', 'Alert', 'Card', 'Modal', 'AlertGroup', 'Text', 'TextInput'],
  getComponentSchema: jest.fn().mockImplementation((name: string) => {
    if (name === 'Button') {
      return Promise.resolve({
        componentName: 'Button',
        propsCount: 10,
        requiredProps: ['children'],
        schema: {
          type: 'object',
          properties: {
            variant: { type: 'string', enum: ['primary', 'secondary'] },
            size: { type: 'string', enum: ['sm', 'md', 'lg'] },
            children: { type: 'string' }
          },
          required: ['children']
        }
      });
    }
    throw new Error(`Component "${name}" not found`);
  })
}));

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentSchemasTool } from '../tool.componentSchemas';

describe('componentSchemasTool', () => {
  const [toolName, toolSchema, toolCallback] = componentSchemasTool();

  it('should have correct tool name and schema', () => {
    expect(toolName).toBe('component-schemas');
    expect(toolSchema.description).toBeDefined();
    expect(toolSchema.inputSchema).toBeDefined();
  });

  it('should work without error for valid component', async () => {
    const result = await toolCallback({ componentName: 'Button' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const response = JSON.parse(result.content[0].text);
    expect(response.componentName).toBe('Button');
    expect(response.schema).toBeDefined();
  });

  // it('should return correct data structure', async () => {
  //   const result = await toolCallback({ componentName: 'Button' });
  //
  //   expect(result.content).toHaveLength(1);
  //   expect(result.content[0].type).toBe('text');
  //
  //   const response = JSON.parse(result.content[0].text);
  //   expect(response.componentName).toBe('Button');
  //   expect(response.schema).toBeDefined();
  // });
  //
  it('should return correct data structure', async () => {
    const result = await toolCallback({ componentName: 'Button' });

    const response = JSON.parse(result.content[0].text);
    expect(response).toHaveProperty('componentName');
    expect(response).toHaveProperty('propsCount');
    expect(response).toHaveProperty('requiredProps');
    expect(response).toHaveProperty('schema');
  });
  it('should throw correct error for invalid component without crashing', async () => {
    await expect(toolCallback({ componentName: 'InvalidComponent' })).rejects.toThrow(McpError);

    try {
      await toolCallback({ componentName: 'InvalidComponent' });
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });
  it('should throw correct error for missing componentName without crashing', async () => {
    await expect(toolCallback({})).rejects.toThrow(McpError);

    try {
      await toolCallback({});
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });
  it('should handle errors gracefully and not crash server', async () => {
    // Test that errors are properly caught and thrown as McpError
    const invalidInputs = [
      {},
      { componentName: null },
      { componentName: 123 },
      { componentName: 'NonExistentComponent' }
    ];

    for (const input of invalidInputs) {
      try {
        await toolCallback(input);
      } catch (error) {
        // Should be McpError, not a regular Error that would crash
        expect(error).toBeInstanceOf(McpError);
      }
    }
  });
});

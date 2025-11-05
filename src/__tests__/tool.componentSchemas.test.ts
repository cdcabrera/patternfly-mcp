// Mock the PatternFly schemas module since it uses ES modules
jest.mock('@patternfly/patternfly-component-schemas/json', () => ({
  componentNames: ['Button', 'Alert', 'Card', 'Modal', 'AlertGroup', 'Text', 'TextInput'],
  getComponentSchema: jest.fn().mockImplementation((name: string) => {
    if (name === 'Button') {
      return Promise.resolve({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        title: 'Button Props',
        description: 'Props for the Button component',
        properties: {
          variant: { type: 'string', enum: ['primary', 'secondary'] },
          size: { type: 'string', enum: ['sm', 'md', 'lg'] },
          children: { type: 'string', description: 'Content rendered inside the button' }
        },
        required: ['children'],
        additionalProperties: false
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
    expect(toolName).toBe('componentSchemas');
    expect(toolSchema.description).toBeDefined();
    expect(toolSchema.inputSchema).toBeDefined();
  });

  it('should work without error for valid component', async () => {
    const result = await toolCallback({ componentName: 'Button' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const response = JSON.parse(result.content[0].text);

    expect(response.$schema).toBeDefined();
    expect(response.type).toBe('object');
    expect(response.title).toBe('Button Props');
    expect(response.properties).toBeDefined();
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

    expect(response).toHaveProperty('$schema');
    expect(response).toHaveProperty('type');
    expect(response).toHaveProperty('title');
    expect(response).toHaveProperty('description');
    expect(response).toHaveProperty('properties');
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

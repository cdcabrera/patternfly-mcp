// Mock the PatternFly schemas module since it uses ES modules
/*
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
*/

import { getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentSchemasTool } from '../tool.componentSchemas';

// Mock dependencies
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

// jest.mock('@patternfly/patternfly-component-schemas/json');

// const mockGetComponentSchema = getComponentSchema as jest.MockedFunction<typeof getComponentSchema>;

describe('componentSchemasTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = componentSchemasTool();

    expect(tool).toMatchSnapshot('structure');
  });
});

describe('fetchDocsTool, callback', () => {
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
    /*
    mockGetComponentSchema.mockResolvedValue({
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
    */

    const [_name, _schema, callback] = componentSchemasTool();
    const result = await callback({ componentName });

    // expect(mockGetComponentSchema.mock.calls).toMatchSnapshot();
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

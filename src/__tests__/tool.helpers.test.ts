import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  validateToolInput,
  validateToolInputString,
  validateToolInputStringLength,
  validateToolInputStringArrayEntryLength,
  validateToolInputStringNumberEnumLike
} from '../tool.helpers';

describe('validateToolInput', () => {
  it.each([
    {
      description: 'basic string validation',
      param: '',
      validator: (value: any) => typeof value !== 'string' || !(value.trim().length > 0)
    },
    {
      description: 'pattern in string validation',
      param: 'patternfly://lorem-ipsum',
      validator: (value: any) => new RegExp('patternfly://', 'i').test(value)
    },
    {
      description: 'array entry length validation',
      param: ['lorem', 'ipsum'],
      validator: (value: any) => !Array.isArray(value) || !(value.length > 2)
    }
  ])('should throw an error for validation, $description', ({ param, validator }) => {
    const errorMessage = `Lorem ipsum error message for ${param} validation.`;

    expect(() => validateToolInput(
      param,
      validator,
      new McpError(
        ErrorCode.InvalidParams,
        errorMessage
      )
    )).toThrow(errorMessage);
  });
});

describe('validateToolInputString', () => {
  it.each([
    {
      description: 'empty string',
      param: ''
    },
    {
      description: 'undefined',
      param: undefined
    },
    {
      description: 'number',
      param: 1
    },
    {
      description: 'null',
      param: null
    }
  ])('should throw an error for validation, $description', ({ param }) => {
    const errorMessage = '"Input" must be a string';

    expect(() => validateToolInputString(
      param
    )).toThrow(errorMessage);
  });
});

describe('validateToolInputStringLength', () => {
  it.each([
    {
      description: 'empty string',
      param: ''
    },
    {
      description: 'undefined',
      param: undefined
    },
    {
      description: 'number',
      param: 1
    },
    {
      description: 'null',
      param: null
    },
    {
      description: 'max',
      param: 'lorem ipsum',
      options: { max: 5 }
    },
    {
      description: 'min',
      param: 'lorem ipsum',
      options: { min: 15 }
    },
    {
      description: 'max and min',
      param: 'lorem ipsum',
      options: { min: 1, max: 10 }
    },
    {
      description: 'max and min and display name',
      param: 'lorem ipsum',
      options: { min: 1, max: 10, inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'max and min and description',
      param: 'lorem ipsum',
      options: { min: 1, max: 10, description: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ param, options }) => {
    const errorMessage = options?.description || `"${options?.inputDisplayName || 'Input'}" must be a string`;

    expect(() => validateToolInputStringLength(
      param,
      { min: 1, max: 100, ...options } as any
    )).toThrow(errorMessage);
  });
});

describe('validateToolInputStringArrayEntryLength', () => {
  it.each([
    {
      description: 'empty string',
      param: ''
    },
    {
      description: 'undefined',
      param: undefined
    },
    {
      description: 'number',
      param: 1
    },
    {
      description: 'null',
      param: null
    },
    {
      description: 'max',
      param: ['lorem ipsum'],
      options: { max: 5 }
    },
    {
      description: 'min',
      param: ['lorem ipsum'],
      options: { min: 15 }
    },
    {
      description: 'max and min',
      param: ['lorem ipsum'],
      options: { min: 1, max: 10 }
    },
    {
      description: 'max and min and display name',
      param: ['lorem ipsum'],
      options: { min: 1, max: 10, inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'max and min and description',
      param: ['lorem ipsum'],
      options: { min: 1, max: 10, description: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ param, options }) => {
    const errorMessage = options?.description || `"${options?.inputDisplayName || 'Input'}" array must contain strings with length`;

    expect(() => validateToolInputStringArrayEntryLength(
      param as any,
      { min: 1, max: 100, ...options } as any
    )).toThrow(errorMessage);
  });
});

describe('validateToolInputStringNumberEnumLike', () => {
  it.each([
    {
      description: 'empty string',
      param: '',
      compare: [2, 3]
    },
    {
      description: 'undefined',
      param: undefined,
      compare: [2, 3]
    },
    {
      description: 'null',
      param: null,
      compare: [2, 3]
    },
    {
      description: 'number',
      param: 1,
      compare: [2, 3]
    },
    {
      description: 'string',
      param: 'lorem ipsum',
      compare: ['amet', 'dolor sit']
    },
    {
      description: 'string and display name',
      param: 'lorem ipsum',
      compare: ['amet', 'dolor sit'],
      options: { inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'string and description',
      param: 'lorem ipsum',
      compare: [1, 2],
      options: { description: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ param, compare, options }) => {
    const errorMessage = options?.description || `"${options?.inputDisplayName || 'Input'}" must be one of the following values`;

    expect(() => validateToolInputStringNumberEnumLike(
      param as any,
      compare as any,
      { ...options } as any
    )).toThrow(errorMessage);
  });

  it('should throw an internal error for validation when missing comparison values', () => {
    const errorMessage = 'List of allowed values is empty';

    expect(() => validateToolInputStringNumberEnumLike(
      1,
      []
    )).toThrow(errorMessage);
  });
});

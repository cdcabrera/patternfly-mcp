import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

const validateToolInput = (args: any | any[], validate: (...args: any[]) => boolean, error: McpError) => {
  const updatedArgs = Array.isArray(args) ? args : [args];

  if (!validate(...updatedArgs)) {
    throw error;
  }
};

const validateToolInputString = (input: unknown) =>
  validateToolInput(
    input,
    (input: unknown) => typeof input === 'string',
    new McpError(ErrorCode.InvalidParams, 'Input must be a string')
  );

const validateToolInputLength = (input: unknown, { max, min, description }: { max: number, min: number, description?: string }) =>
  validateToolInput(
    input,
    (input: unknown) => typeof input === 'string' && input.length >= min && input.length <= max,
    new McpError(ErrorCode.InvalidParams, description || `Input must be a string with length between ${min} and ${max} characters`)
  );

const validateToolInputArrayEntryLength = (input: unknown[], { max, min, description }: { max: number, min: number, description?: string }) =>
  validateToolInput(
    input,
    (input: unknown[]) => input.every(entry => typeof entry === 'string' && entry.length >= min && entry.length <= max),
    new McpError(ErrorCode.InvalidParams, description || `Input array must contain strings with length between ${min} and ${max} characters`)
  );

const validateToolInputEnum = (input: unknown, values: unknown[]) =>
  validateToolInput(
    input,
    (input: unknown) => typeof input === 'string' && values.includes(input),
    new McpError(ErrorCode.InvalidParams, `Input must be one of the following values: ${values.join(', ')}`)
  );

export { validateToolInput, validateToolInputString, validateToolInputLength, validateToolInputArrayEntryLength, validateToolInputEnum };

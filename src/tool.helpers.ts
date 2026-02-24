import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/**
 * Validates input arguments by applying a custom validation function. Centralizes and throws an error if the validation fails.
 *
 * @param args - The input arguments to be validated. Can be a single value or an array of values.
 * @param validate - A validation function that takes the arguments and returns a boolean indicating whether the input is valid.
 *  - Return `true` to indicate invalid input and throw an error.
 *  - Return `false` to indicate valid input.
 * @param {McpError} error - The error to be thrown if validation fails.
 * @returns Does not return a value if validation is successful.
 *
 * @throws {McpError} Throws the provided error if the input validation fails.
 */
const validateToolInput = (args: any | any[], validate: (...args: any[]) => boolean, error: McpError) => {
  const updatedArgs = [args];

  if (validate(...updatedArgs)) {
    throw error;
  }
};

/**
 * Validate tool input is a string.
 *
 * @param input - The input value
 * @param options - Validation options
 * @param options.inputDisplayName - Display name for the input. Used in the default error message. Defaults to 'Input'.
 *
 * @throws McpError If input is not a string OR is empty
 */
function validateToolInputString(
  input: unknown,
  { inputDisplayName }: { inputDisplayName?: string } = {}
): asserts input is string {
  validateToolInput(
    input,
    (vInput: unknown) => typeof vInput !== 'string' || !(vInput.trim().length > 0),
    new McpError(ErrorCode.InvalidParams, `"${inputDisplayName || 'Input'}" must be a string`)
  );
}

/**
 * Validate tool input length.
 *
 * @param input - The input string
 * @param options - Validation options
 * @param options.max - Maximum length of the string
 * @param options.min - Minimum length of the string
 * @param options.inputDisplayName - Display name for the input. Used in the default error message. Defaults to 'Input'.
 * @param options.description - Error description. A default error message with optional `inputDisplayName` is generated if not provided.
 *
 * @throws McpError If input is not a string OR does not meet length requirements
 */
function validateToolInputStringLength(
  input: unknown,
  { max, min, inputDisplayName, description }: { max: number, min: number, inputDisplayName?: string, description?: string }
): asserts input is string {
  validateToolInput(
    input,
    (vInput: unknown) => typeof vInput !== 'string' || !(vInput.length >= min && vInput.length <= max),
    new McpError(ErrorCode.InvalidParams, description || `"${inputDisplayName || 'Input'}" must be a string from "${min}" to "${max}" characters`)
  );
}

/**
 * Validate tool input array entries are strings and have length.
 *
 * @param input - Array of strings
 * @param options - Validation options
 * @param options.max - Maximum length of each string in the array
 * @param options.min - Minimum length of each string in the array
 * @param options.inputDisplayName - Display name for the input. Used in the default error messages. Defaults to 'Input'.
 * @param options.description - Error description. A default error message with optional `inputDisplayName` is generated if not provided.
 *
 * @throws McpError If input is not an array of strings OR does not meet length requirements
 */
function validateToolInputStringArrayEntryLength(
  input: unknown[],
  { max, min, inputDisplayName, description }: { max: number, min: number, inputDisplayName?: string, description?: string }
): asserts input is string[] {
  validateToolInput(
    input,
    (vInput: unknown[]) => !Array.isArray(vInput) || !vInput.every(entry => typeof entry === 'string' && entry.trim().length >= min && entry.trim().length <= max),
    // (vInput: unknown[]) => Array.isArray(vInput) && !vInput.every(entry => typeof entry === 'string' && entry.trim().length >= min && entry.trim().length <= max),
    new McpError(ErrorCode.InvalidParams, description || `"${inputDisplayName || 'Input'}" array must contain strings with length from "${min}" to "${max}" characters`)
  );
}

/**
 * Validate tool input is a string or number and from one of the provided list/array/enum values.
 *
 * @param input - The input value
 * @param values - List of allowed values
 * @param options - Validation options
 * @param options.inputDisplayName - Display name for the input. Used in the default error messages. Defaults to 'Input'.
 * @param options.description - Error description. A default error message with optional `inputDisplayName` is generated if not provided.
 *
 * @throws McpError If input is not a string or number OR is not one of the allowed values
 */
function validateToolInputStringNumberEnumLike(
  input: unknown,
  values: unknown[],
  { inputDisplayName, description }: { inputDisplayName?: string, description?: string } = {}
): asserts input is unknown[] {
  let updatedDescription = description || `"${inputDisplayName || 'Input'}" must be one of the following values: ${values.join(', ')}`;
  let errorCode = ErrorCode.InvalidParams;

  if (!values.length) {
    errorCode = ErrorCode.InternalError;
    updatedDescription = `Unable to confirm "${inputDisplayName || 'input'}." List of allowed values is empty or undefined.`;
  }

  validateToolInput(
    input,
    // (vInput: unknown) => !(typeof vInput === 'string' && typeof vInput.trim().length) || typeof vInput !== 'number' || !values.includes(vInput),
    (vInput: unknown) => !(typeof vInput === 'string' && typeof vInput.trim().length) || typeof vInput !== 'number' || !values.length || !values.includes(vInput),
    new McpError(errorCode, updatedDescription)
  );
}

export {
  validateToolInput,
  validateToolInputString,
  validateToolInputStringLength,
  validateToolInputStringArrayEntryLength,
  validateToolInputStringNumberEnumLike
};

import { z } from 'zod';
import { isPlainObject } from './server.helpers';

/**
 * Check if a value is a Zod schema (v3 or v4).
 *
 * @param value - Value to check
 * @returns `true` if the value appears to be a Zod schema
 */
const isZodSchema = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Zod v3 has _def property
  // Zod v4 has _zod property
  // Zod schemas have parse/safeParse methods
  return (
    ('_def' in obj && obj._def !== undefined) ||
    ('_zod' in obj && obj._zod !== undefined) ||
    (typeof obj.parse === 'function') ||
    (typeof obj.safeParse === 'function') ||
    (typeof obj.safeParseAsync === 'function')
  );
};

/**
 * Check if a value is a ZodRawShapeCompat (object with Zod schemas as values).
 *
 * @param value - Value to check
 * @returns `true` if the value appears to be a ZodRawShapeCompat
 */
const isZodRawShape = (value: unknown): boolean => {
  if (!isPlainObject(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const values = Object.values(obj);

  // Empty object is not a shape
  if (values.length === 0) {
    return false;
  }

  // All values must be Zod schemas
  return values.every(isZodSchema);
};

/**
 * Convert a plain JSON Schema object to a Zod schema.
 * - For simple cases, converts to appropriate Zod schemas.
 * - For complex cases, falls back to z.any() to accept any input.
 *
 * @param jsonSchema - Plain JSON Schema object
 * @returns Zod schema equivalent
 */
const jsonSchemaToZod = (jsonSchema: unknown): z.ZodTypeAny => {
  if (!isPlainObject(jsonSchema)) {
    return z.any();
  }

  const schema = jsonSchema as Record<string, unknown>;

  // Handle object type schemas
  if (schema.type === 'object') {
    // If additionalProperties is true, allow any properties
    if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
      // This is a simplified conversion - full JSON Schema to Zod conversion would be more complex
      return z.object({}).passthrough();
    }

    // If additionalProperties is false, use strict object
    return z.object({}).strict();
  }

  // For other types, fall back to z.any()
  // A full implementation would handle array, string, number, boolean, etc.
  return z.any();
};

/**
 * Normalize an inputSchema to a format compatible with MCP SDK.
 * If it's already a Zod schema or ZodRawShapeCompat, return as-is.
 * If it's a plain JSON Schema, convert it to a Zod schema.
 *
 * @param inputSchema - Input schema (Zod schema, ZodRawShapeCompat, or plain JSON Schema)
 * @returns Normalized schema compatible with MCP SDK
 */
const normalizeInputSchema = (inputSchema: unknown): unknown => {
  // If it's already a Zod schema, return as-is
  if (isZodSchema(inputSchema)) {
    return inputSchema;
  }

  // If it's a ZodRawShapeCompat (object with Zod schemas as values), return as-is
  if (isZodRawShape(inputSchema)) {
    return inputSchema;
  }

  // If it's a plain JSON Schema object, convert to Zod
  if (isPlainObject(inputSchema)) {
    return jsonSchemaToZod(inputSchema);
  }

  // Fallback: return as-is (might be undefined or other types)
  return inputSchema;
};

export { isZodSchema, isZodRawShape, jsonSchemaToZod, normalizeInputSchema };

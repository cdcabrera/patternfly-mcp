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
 * Convert a JSON Schema property definition to a Zod schema.
 * Handles individual property types, enums, and nested structures.
 *
 * @param propSchema - JSON Schema property definition
 * @returns Zod schema for the property
 */
const jsonSchemaPropertyToZod = (propSchema: unknown): z.ZodTypeAny => {
  if (!isPlainObject(propSchema)) {
    return z.any();
  }

  const prop = propSchema as Record<string, unknown>;
  const typeValue = prop.type;

  // Handle enum values
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    const enumValues = prop.enum;

    // Zod's z.enum() only supports string enums
    if (enumValues.every(val => typeof val === 'string')) {
      return z.enum(enumValues as [string, ...string[]]);
    }

    // For number, boolean, or mixed enums, use union of literals
    const literalSchemas = enumValues.map(val => z.literal(val));
    return z.union(literalSchemas as [z.ZodLiteral<unknown>, z.ZodLiteral<unknown>, ...z.ZodLiteral<unknown>[]]);
  }

  // Handle type unions (array of types)
  if (Array.isArray(typeValue)) {
    const unionSchemas = typeValue.map(t => {
      if (t === 'string') {
        return z.string();
      }

      if (t === 'number' || t === 'integer') {
        return z.number();
      }

      if (t === 'boolean') {
        return z.boolean();
      }

      if (t === 'array') {
        const items = prop.items;
        const itemSchema = isPlainObject(items) ? jsonSchemaPropertyToZod(items) : z.any();

        return z.array(itemSchema);
      }

      if (t === 'object') {
        return jsonSchemaToZod(prop);
      }

      if (t === 'null') {
        return z.null();
      }

      return z.any();
    });

    if (unionSchemas.length > 0) {
      return z.union(unionSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
    }

    return z.any();
  }

  // Handle single type
  if (typeValue === 'string') {
    return z.string();
  }

  if (typeValue === 'number' || typeValue === 'integer') {
    return z.number();
  }

  if (typeValue === 'boolean') {
    return z.boolean();
  }

  if (typeValue === 'array') {
    const items = prop.items;
    const itemSchema = isPlainObject(items) ? jsonSchemaPropertyToZod(items) : z.any();

    return z.array(itemSchema);
  }

  if (typeValue === 'object') {
    return jsonSchemaToZod(prop);
  }

  if (typeValue === 'null') {
    return z.null();
  }

  // Fallback for unknown types
  return z.any();
};

/**
 * Convert a plain JSON Schema object to a Zod schema.
 * Properly handles properties, required fields, and additionalProperties.
 *
 * @param jsonSchema - Plain JSON Schema object
 * @returns Zod schema equivalent
 */
const jsonSchemaToZod = (jsonSchema: unknown): z.ZodTypeAny => {
  // Use lenient check for objects after IPC serialization
  const isObjectLike = jsonSchema !== null && typeof jsonSchema === 'object' && !Array.isArray(jsonSchema);
  
  if (!isObjectLike) {
    return z.any();
  }

  const schema = jsonSchema as Record<string, unknown>;

  // Handle object type schemas or schemas with properties (even without explicit type)
  if (schema.type === 'object' || (schema.properties && !schema.type)) {
    const properties = schema.properties as Record<string, unknown> | undefined;
    const required = Array.isArray(schema.required) ? schema.required as string[] : [];
    const additionalProperties = schema.additionalProperties;

    // If we have properties, convert them
    if (properties && typeof properties === 'object') {
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const [key, prop] of Object.entries(properties)) {
        const propSchema = jsonSchemaPropertyToZod(prop);
        const isRequired = required.includes(key);

        shape[key] = isRequired ? propSchema : propSchema.optional();
      }

      // Handle additionalProperties
      if (additionalProperties === false) {
        return z.object(shape).strict();
      }

      return z.object(shape).passthrough();
    }

    // No properties - empty object
    if (additionalProperties === false) {
      return z.object({}).strict();
    }

    return z.object({}).passthrough();
  }

  // For non-object types, fall back to z.any()
  return z.any();
};

/**
 * Attempt to normalize an `inputSchema` to a Zod schema, compatible with the MCP SDK.
 * - If it's already a Zod schema or ZodRawShapeCompat, return as-is.
 * - If it's a plain JSON Schema, convert it to a Zod schema.
 *
 * @param inputSchema - Input schema (Zod schema, ZodRawShapeCompat, or plain JSON Schema)
 * @returns Returns a Zod instance for known inputs (Zod schema, raw shape, or JSON Schema), or the original value otherwise.
 */
const normalizeInputSchema = (inputSchema: unknown): z.ZodTypeAny | unknown => {
  // If it's already a Zod schema or a ZodRawShapeCompat (object with Zod schemas as values), return as-is
  if (isZodSchema(inputSchema)) {
    return inputSchema;
  }

  // If it's a Zod raw shape (object of Zod schemas), wrap as a Zod object schema
  if (isZodRawShape(inputSchema)) {
    return z.object(inputSchema as Record<string, any>);
  }

  // If it's a plain JSON Schema object, convert to Zod
  // Use lenient check for objects after IPC serialization
  if (isPlainObject(inputSchema)) {
    return jsonSchemaToZod(inputSchema);
  }

  // After IPC serialization, objects may not pass isPlainObject check
  // Use a more lenient check for object-like structures with JSON Schema fields
  if (inputSchema !== null && typeof inputSchema === 'object' && !Array.isArray(inputSchema)) {
    const obj = inputSchema as Record<string, unknown>;
    if ('type' in obj || 'properties' in obj) {
      return jsonSchemaToZod(inputSchema);
    }
  }

  // Fallback: return as-is (might be undefined or other types)
  return inputSchema;
};

export { isZodSchema, isZodRawShape, jsonSchemaToZod, normalizeInputSchema };

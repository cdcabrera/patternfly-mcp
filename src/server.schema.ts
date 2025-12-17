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
 * Handles individual property types, enums, and nested objects.
 *
 * @param propertySchema - JSON Schema property definition
 * @returns Zod schema for the property
 */
const jsonSchemaPropertyToZod = (propertySchema: unknown): z.ZodTypeAny => {
  if (!isPlainObject(propertySchema)) {
    return z.any();
  }

  const prop = propertySchema as Record<string, unknown>;
  const type = prop.type;

  // Handle enum values
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    const enumValues = prop.enum as unknown[];
    const firstValue = enumValues[0];

    // Zod enum only supports string enums
    if (typeof firstValue === 'string' && enumValues.every(val => typeof val === 'string')) {
      return z.enum(enumValues as [string, ...string[]]);
    }

    // For non-string enums or mixed types, use union of literals
    if (enumValues.length >= 2) {
      const literals = enumValues.map(val => {
        if (typeof val === 'string') {
          return z.literal(val);
        }

        if (typeof val === 'number') {
          return z.literal(val);
        }

        if (typeof val === 'boolean') {
          return z.literal(val);
        }

        return z.any();
      });

      // TypeScript requires at least 2 elements for union
      if (literals.length >= 2) {
        return z.union([literals[0], literals[1], ...literals.slice(2)] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
      }
    }

    // Single enum value - use literal
    if (enumValues.length === 1) {
      const val = enumValues[0];

      if (typeof val === 'string') {
        return z.literal(val);
      }

      if (typeof val === 'number') {
        return z.literal(val);
      }

      if (typeof val === 'boolean') {
        return z.literal(val);
      }

      return z.any();
    }
  }

  // Handle different types
  if (Array.isArray(type)) {
    // Union of types - convert to Zod union
    const zodTypes = type.map(typeValue => jsonSchemaPropertyToZod({ ...prop, type: typeValue }));

    return z.union(zodTypes as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array': {
      const items = prop.items;

      if (items) {
        const itemSchema = jsonSchemaPropertyToZod(items);

        return z.array(itemSchema);
      }

      return z.array(z.any());
    }
    case 'object': {
      return jsonSchemaToZod(prop);
    }
    case 'null':
      return z.null();
    default:
      // Unknown type or no type specified
      return z.any();
  }
};

/**
 * Convert a plain JSON Schema object to a Zod schema.
 * - Handles object schemas with properties and required fields
 * - Converts property types to appropriate Zod schemas
 * - Supports nested objects and arrays
 * - Handles additionalProperties (passthrough vs strict)
 *
 * @param jsonSchema - Plain JSON Schema object
 * @returns Zod schema equivalent
 */
const jsonSchemaToZod = (jsonSchema: unknown): z.ZodTypeAny => {
  if (!isPlainObject(jsonSchema)) {
    return z.any();
  }

  const schema = jsonSchema as Record<string, unknown>;
  const type = schema.type;

  // Handle object type schemas with properties
  if (type === 'object' || (type === undefined && schema.properties)) {
    const properties = schema.properties;
    const required = Array.isArray(schema.required) ? schema.required as string[] : [];
    const additionalProperties = schema.additionalProperties;

    // If properties are defined, convert them to Zod object shape
    if (isPlainObject(properties)) {
      const shape: Record<string, z.ZodTypeAny> = {};
      const props = properties as Record<string, unknown>;

      for (const [key, propSchema] of Object.entries(props)) {
        const zodProp = jsonSchemaPropertyToZod(propSchema);

        // Mark as optional if not in required array
        shape[key] = required.includes(key) ? zodProp : zodProp.optional();
      }

      const zodObject = z.object(shape);

      // Handle additionalProperties
      if (additionalProperties === false) {
        return zodObject.strict();
      }

      // Default behavior: passthrough (allow additional properties)
      return zodObject.passthrough();
    }

    // No properties defined - empty object
    if (additionalProperties === false) {
      return z.object({}).strict();
    }

    // Default: passthrough
    return z.object({}).passthrough();
  }

  // Handle non-object types directly
  if (type) {
    return jsonSchemaPropertyToZod(schema);
  }

  // Fallback: return z.any() for unknown schemas
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
    return z.object(inputSchema as Record<string, z.ZodTypeAny>);
  }

  // If it's a plain JSON Schema object, convert to Zod
  if (isPlainObject(inputSchema)) {
    return jsonSchemaToZod(inputSchema);
  }

  // Fallback: return as-is (might be undefined or other types)
  return inputSchema;
};

export { isZodSchema, isZodRawShape, jsonSchemaToZod, normalizeInputSchema };

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  createMcpTool,
  isFilePath,
  isUrlLike,
  normalizeFilePackage,
  normalizeTuple,
  normalizeTupleSchema,
  normalizeObject,
  normalizeFunction,
  normalizeTools,
  sanitizeDataProp,
  sanitizePlainObject
} from '../server.toolsUser';
import { isZodSchema } from '../server.schema';

describe('sanitizeDataProp', () => {
  it('returns descriptor for data property and excludes accessors', () => {
    const obj = { a: 1 };

    Object.defineProperty(obj, 'b', { get: () => 2 });
    const a = sanitizeDataProp(obj, 'a');
    const b = sanitizeDataProp(obj, 'b');
    const cProp = sanitizeDataProp(obj, 'c');

    expect(a?.value).toBe(1);
    expect(b).toBeUndefined();
    expect(cProp).toBeUndefined();
  });
});

describe('sanitizePlainObject', () => {
  it('filters to allowed keys and ignores accessors', () => {
    const allowed = new Set(['x', 'y']);
    const obj = { x: 1, y: 2, z: 3 };

    Object.defineProperty(obj, 'y', { get: () => 2 });
    const out = sanitizePlainObject(obj, allowed);

    expect(out).toEqual({ x: 1 });
    expect(Object.prototype.hasOwnProperty.call(out, 'y')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'z')).toBe(false);
  });

  it.each([
    { description: 'null', obj: null },
    { description: 'undefined', obj: undefined },
    { description: 'array', obj: [1, 2, 3] },
    { description: 'function', obj: () => {} }
  ])('should return an empty object, $description', ({ obj }) => {
    expect(sanitizePlainObject(obj, new Set())).toEqual({});
  });
});

describe('isFilePath', () => {
  it.each([
    { description: 'absolute path', file: '/path/to/file.txt' },
    { description: 'absolute path ref no extension', file: '/path/to/another/file' },
    { description: 'min file extension', file: 'path/to/another/file.y' },
    { description: 'potential multiple extensions', file: 'path/to/another/file.test.js' },
    { description: 'current dir ref', file: './path/to/another/file.txt' },
    { description: 'parent dir ref', file: '../path/to/another/file.txt' }
  ])('should validate $description', ({ file }) => {
    expect(isFilePath(file)).toBe(true);
  });

  it.each([
    { description: 'no file extension or dir ref', file: 'path/to/another/file' }
  ])('should fail, $description', ({ file }) => {
    expect(isFilePath(file)).toBe(false);
  });
});

describe('isUrlLike', () => {
  it.each([
    { description: 'http', url: 'http://example.com' },
    { description: 'https', url: 'https://example.com' },
    { description: 'file', url: 'file:///path/to/file.txt' },
    { description: 'node', url: 'node://path/to/file.txt' },
    { description: 'data', url: 'data:text/plain;base64,1234567890==' }
  ])('should validate $description', ({ url }) => {
    expect(isUrlLike(url)).toBe(true);
  });

  it.each([
    { description: 'invalid protocol', url: 'ftp://example.com' },
    { description: 'random', url: 'random://example.com' },
    { description: 'null', url: null },
    { description: 'undefined', url: undefined }
  ])('should fail, $description', ({ url }) => {
    expect(isUrlLike(url as any)).toBe(false);
  });
});

describe('normalizeTupleSchema', () => {
  it.each([
    {
      description: 'valid JSON schema with description',
      schema: { description: '  hello  ', inputSchema: { type: 'object', properties: {} } }
    },
    {
      description: 'valid JSON schema without description',
      schema: { inputSchema: { type: 'object', properties: {} } }
    },
    {
      description: 'non-object',
      schema: 'nope'
    },
    {
      description: 'object missing inputSchema',
      schema: { description: 'x' }
    }
  ])('should normalize object, $description', ({ schema }) => {
    const updated = normalizeTupleSchema(schema);

    if (updated?.inputSchema) {
      updated.inputSchema = `isZod = ${isZodSchema(updated.inputSchema)}`;
    }

    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeTupleSchema.memo).toBeDefined();
  });
});

describe('normalizeTuple', () => {
  it.each([
    {
      description: 'basic',
      tuple: ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}]
    },
    {
      description: 'untrimmed name, zod schema, async handler',
      tuple: ['loremIpsum  ', { description: 'lorem ipsum', inputSchema: z.any() }, async () => {}]
    },
    {
      description: 'missing schema',
      tuple: ['dolorSit', { description: 'x' }, async () => {}]
    },
    {
      description: 'missing handler',
      tuple: ['dolorSit', { description: 'x' }]
    },
    {
      description: 'undefined',
      tuple: undefined
    },
    {
      description: 'null',
      tuple: null
    }
  ])('should normalize the config, $description', ({ tuple }) => {
    const updated = normalizeTuple(tuple);

    if ((updated?.original as any)?.[1]?.inputSchema && isZodSchema((updated?.original as any)[1].inputSchema)) {
      (updated?.original as any)[1].inputSchema = 'isZod = true';
    }

    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeTuple.memo).toBeDefined();
  });
});

describe('normalizeObject', () => {
  it.each([
    {
      description: 'basic',
      obj: { name: 'loremIpsum', description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} }, handler: () => {} }
    },
    {
      description: 'untrimmed name, zod schema, async handler',
      obj: { name: 'loremIpsum', description: 'lorem ipsum', inputSchema: z.any(), handler: async () => {} }
    },
    {
      description: 'missing schema',
      obj: { name: 'dolorSit', description: 'x', handler: async () => {} }
    },
    {
      description: 'missing handler',
      obj: { name: 'dolorSit', description: 'x' }
    },
    {
      description: 'undefined',
      tuple: undefined
    },
    {
      description: 'null',
      tuple: null
    }
  ])('should normalize the config, $description', ({ obj }) => {
    const updated = normalizeObject(obj);

    if ((updated?.original as any)?.inputSchema && isZodSchema((updated?.original as any).inputSchema)) {
      (updated?.original as any).inputSchema = 'isZod = true';
    }

    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeObject.memo).toBeDefined();
  });
});

describe('normalizeFunction', () => {
  it('should have a memo property', () => {
    expect(normalizeFunction.memo).toBeDefined();
  });
});

describe('normalizeFilePackage', () => {
  it('should have a memo property', () => {
    expect(normalizeFilePackage.memo).toBeDefined();
  });
});

describe('normalizeTools', () => {
  it('should have a memo property', () => {
    expect(normalizeTools.memo).toBeDefined();
  });
});

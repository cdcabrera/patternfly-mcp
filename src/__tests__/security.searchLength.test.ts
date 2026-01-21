import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { searchPatternFlyDocsTool } from '../tool.searchPatternFlyDocs';
import { usePatternFlyDocsTool } from '../tool.patternFlyDocs';
import { componentSchemasTool } from '../tool.componentSchemas';
import { patternFlyDocsTemplateResource } from '../resource.patternFlyDocsTemplate';
import { patternFlySchemasTemplateResource } from '../resource.patternFlySchemasTemplate';

describe('Search Input Length Security', () => {
  const longString = 'a'.repeat(257);

  describe('searchPatternFlyDocs tool', () => {
    it('rejects long search query', async () => {
      const tool = searchPatternFlyDocsTool();
      const callback = tool[2];

      try {
        await callback({ searchQuery: longString });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toMatch(/exceeds maximum length/);
      }
    });

    it('accepts custom length limit', async () => {
      const tool = searchPatternFlyDocsTool({ maxSearchLength: 10 } as any);
      const callback = tool[2];

      try {
        await callback({ searchQuery: '12345678901' });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toMatch(/exceeds maximum length of 10/);
      }
    });
  });

  describe('usePatternFlyDocs tool', () => {
    it('rejects long component name', async () => {
      const tool = usePatternFlyDocsTool();
      const callback = tool[2];

      try {
        await callback({ name: longString });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toMatch(/exceeds maximum length/);
      }
    });
  });

  describe('componentSchemas tool', () => {
    it('rejects long component name', async () => {
      const tool = componentSchemasTool();
      const callback = tool[2];

      try {
        await callback({ componentName: longString });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toMatch(/exceeds maximum length/);
      }
    });
  });

  describe('patternfly://docs/{name} resource', () => {
    it('rejects long name variable', async () => {
      const resource = patternFlyDocsTemplateResource();
      const callback = resource[3];

      try {
        await callback(new URL('patternfly://docs/foo'), { name: longString });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toMatch(/exceeds maximum length/);
      }
    });
  });

  describe('patternfly://schemas/{name} resource', () => {
    it('rejects long name variable', async () => {
      const resource = patternFlySchemasTemplateResource();
      const callback = resource[3];

      try {
        await callback(new URL('patternfly://schemas/foo'), { name: longString });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toMatch(/exceeds maximum length/);
      }
    });
  });
});

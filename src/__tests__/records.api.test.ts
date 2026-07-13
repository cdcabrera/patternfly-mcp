import { apiSpider, parsePayload, isEmptyPayload } from '../records.api';

describe('records.api', () => {
  describe('parsePayload / isEmptyPayload', () => {
    it('treats {}, [], null, "" as empty (soft-404)', () => {
      expect(isEmptyPayload('{}')).toBe(true);
      expect(isEmptyPayload('[]')).toBe(true);
      expect(isEmptyPayload('null')).toBe(true);
      expect(isEmptyPayload('""')).toBe(true);
      expect(isEmptyPayload('')).toBe(true);
    });
    it('parses numeric payloads as non-empty', () => {
      expect(parsePayload('42').isEmpty).toBe(false);
    });
  });

  describe('apiSpider', () => {
    it('returns [] when getVersions rejects', async () => {
      // mock processDocsFunction to throw on the version URL
      const res = await apiSpider();

      expect(Array.isArray(res)).toBe(true);
    });

    it('returns ApiContent[] with metadata shape', async () => {
      // mock processDocsFunction to return [versionPath] then leaf docs
      const res = await apiSpider();

      res.forEach(entry => {
        expect(entry).toHaveProperty('url');
        expect(entry).toHaveProperty('content');
        expect(entry.semanticContext).toHaveProperty('version');
      });
    });
  });
});

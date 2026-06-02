import {
  formatSummaryFullContent,
  encodeDecodeCursor,
  nextCursor
} from '../resource.helpers';

describe('resource.helpers', () => {
  describe('formatSummaryFullContent', () => {
    const content = '# My Title\nSome content here.';
    const url = 'patternfly://test';

    it('should format full content without frontmatter', () => {
      const result = formatSummaryFullContent(content);

      expect(result).toContain('# My Title');
      expect(result).toContain('---');
      expect(result).toContain('pfmcp_detail: summary');
    });

    it('should prefix passed frontMatter keys', () => {
      const result = formatSummaryFullContent(content, {
        frontMatter: {
          name: 'test-name',
          version: 'v6'
        }
      });

      expect(result).toContain('pfmcp_name: test-name');
      expect(result).toContain('pfmcp_version: v6');
    });

    it('should merge existing frontmatter from content', () => {
      const contentWithFM = '---\ntitle: Original Title\ncategory: core\n---\n# My Title\nSome content.';
      const result = formatSummaryFullContent(contentWithFM, {
        frontMatter: {
          name: 'test-name'
        }
      });

      expect(result).toContain('title: Original Title');
      expect(result).toContain('category: core');
      expect(result).toContain('pfmcp_name: test-name');
      expect(result).toContain('pfmcp_detail: summary');
      expect(result).toContain('# My Title');
    });

    it('should handle summary detailType and prefix links', () => {
      const result = formatSummaryFullContent(content, {
        url,
        detailType: 'summary'
      });

      expect(result).toContain('pfmcp_full_uri: patternfly://test?detail=full');
      expect(result).toContain('pfmcp_detail: full');
      expect(result).toContain('[Read full documentation](patternfly://test)');
    });

    it('should handle full detailType and prefix links', () => {
      const result = formatSummaryFullContent(content, {
        url,
        detailType: 'full'
      });

      expect(result).toContain('pfmcp_summary_uri: patternfly://test?detail=summary');
      expect(result).toContain('pfmcp_detail: summary');
      expect(result).toContain('[Read summary documentation](patternfly://test)');
    });

    it.each([
      ['summary', 'pfmcp_full_uri', 'detail=full'],
      ['full', 'pfmcp_summary_uri', 'detail=summary']
    ])('should correctly set detail properties for %s', (detailType, expectedKey, expectedParam) => {
      const result = formatSummaryFullContent(content, {
        url,
        detailType: detailType as 'summary' | 'full'
      });

      expect(result).toContain(`${expectedKey}: ${url}?${expectedParam}`);
    });
  });

  describe('encodeDecodeCursor', () => {
    const { encodeCursor, decodeCursor } = encodeDecodeCursor();

    it.each([
      [0, '6f66667365743a30'],
      [50, '6f66667365743a3530'],
      [undefined, '6f66667365743a30']
    ])('should encode offset %p to %p', (offset, expected) => {
      expect(encodeCursor(offset as any)).toBe(expected);
    });

    it.each([
      ['6f66667365743a30', 0],
      ['6f66667365743a3530', 50],
      ['invalid', 0],
      [undefined, 0]
    ])('should decode cursor %p to %p', (cursor, expected) => {
      expect(decodeCursor(cursor as any)).toBe(expected);
    });

    it('should use custom salt and encoding', () => {
      const custom = encodeDecodeCursor({ salt: 'test', encoding: 'base64' });
      const encoded = custom.encodeCursor(10);

      expect(Buffer.from(encoded, 'base64').toString()).toBe('test:10');
      expect(custom.decodeCursor(encoded)).toBe(10);
    });
  });

  describe('nextCursor', () => {
    it.each([
      [{ cursor: undefined, pageSize: 50, size: 100 }, { start: 0, end: 50, next: '6f66667365743a3530' }],
      [{ cursor: '6f66667365743a3530', pageSize: 50, size: 100 }, { start: 50, end: 100, next: undefined }],
      [{ cursor: undefined, pageSize: 50, size: 30 }, { start: 0, end: 30, next: undefined }]
    ])('should calculate next cursor correctly for %p', (params, expected) => {
      const result = nextCursor(params);

      expect(result).toEqual(expected);
    });
  });
});

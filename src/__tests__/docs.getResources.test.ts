import { spiderSegments, runSpider } from '../docs.getResources';
import * as getResources from '../server.getResources';
import { toCamelCase } from '../server.helpers';

jest.mock('../server.getResources');

describe('docs.getResources', () => {
  const mockLoadFileFetch = getResources.loadFileFetch as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('spiderSegments', () => {
    it('should correctly spider segments and add terminal docs to catalog', async () => {
      const baseUrl = 'https://api.test/v6';
      const version = 'v6';
      const catalog = { meta: { totalEntries: 0, totalDocs: 0, source: 'api' }, docs: {} } as any;
      const context = {
        version,
        running: () => true,
        abortController: new AbortController(),
        visited: new Set<string>(),
        throttleMs: 0
      };

      // Mock sequence:
      // 1. Root: returns ['components']
      // 2. components: returns ['button']
      // 3. button: returns ['react', 'design-guidelines']
      // 4. button/react: returns terminal content
      mockLoadFileFetch
        .mockResolvedValueOnce({ content: JSON.stringify(['components']), resolvedPath: baseUrl })
        .mockResolvedValueOnce({ content: JSON.stringify(['button']), resolvedPath: `${baseUrl}/components` })
        .mockResolvedValueOnce({ content: JSON.stringify(['react']), resolvedPath: `${baseUrl}/components/button` })
        .mockResolvedValueOnce({ content: 'terminal content', resolvedPath: `${baseUrl}/components/button/react` });

      await spiderSegments(baseUrl, [version], context, catalog);

      expect(catalog.meta.totalDocs).toBe(1);
      const unifiedName = toCamelCase('button');
      expect(catalog.docs[unifiedName]).toBeDefined();
      expect(catalog.docs[unifiedName][0].category).toBe('react');
    });

    it('should prevent infinite loops using cycle detection', async () => {
      const baseUrl = 'https://api.test/v6/';
      const childUrl = 'https://api.test/v6/child';
      const catalog = { meta: { totalEntries: 0, totalDocs: 0, source: 'api' }, docs: {} } as any;
      const context = {
        version: 'v6',
        running: () => true,
        abortController: new AbortController(),
        visited: new Set<string>(),
        throttleMs: 0
      };

      // Mock cycle:
      // 1. Root: returns ['child']
      // 2. child: returns ['v6'] -> where 'v6' will resolve to root baseUrl
      mockLoadFileFetch
        .mockResolvedValueOnce({ content: JSON.stringify(['child']), resolvedPath: baseUrl })
        .mockResolvedValueOnce({ content: JSON.stringify(['..']), resolvedPath: childUrl });

      await spiderSegments(baseUrl, ['v6'], context, catalog);

      // Should only be called twice because child/.. returns to root which is in visited.
      expect(mockLoadFileFetch).toHaveBeenCalledTimes(2);
    });

    it('should respect throttling if enabled', async () => {
      const baseUrl = 'https://api.test/v6';
      const catalog = { meta: { totalEntries: 0, totalDocs: 0, source: 'api' }, docs: {} } as any;
      const context = {
        version: 'v6',
        running: () => true,
        abortController: new AbortController(),
        visited: new Set<string>(),
        throttleMs: 10
      };

      mockLoadFileFetch.mockResolvedValue({ content: JSON.stringify([]), resolvedPath: baseUrl });

      const start = Date.now();
      await spiderSegments(baseUrl, ['v6'], context, catalog);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('runSpider', () => {
    it('should orchestrate the spider run and return a populated catalog', async () => {
      const baseUrl = 'https://api.test/v6';
      mockLoadFileFetch.mockResolvedValue({ content: JSON.stringify([]), resolvedPath: baseUrl });

      const catalog = await runSpider(baseUrl, 'v6', { running: () => true });

      expect(catalog.meta).toBeDefined();
      expect(catalog.docs).toBeDefined();
      expect(mockLoadFileFetch).toHaveBeenCalledWith(baseUrl, expect.any(Object));
    });
  });
});

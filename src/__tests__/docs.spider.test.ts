import { buildDocs, needsUpdate } from '../docs.spider';
import { runSpider } from '../docs.getResources';
import { stat, writeFile, rename } from 'node:fs/promises';
import { getOptions } from '../options.context';
import { log } from '../logger';

jest.mock('node:fs/promises');
jest.mock('../docs.getResources');
jest.mock('../options.context');
jest.mock('../logger');

describe('docs.spider', () => {
  const mockRunSpider = runSpider as jest.Mock;
  const mockGetOptions = getOptions as jest.Mock;
  const mockStat = stat as jest.Mock;
  const mockWriteFile = writeFile as jest.Mock;
  const mockRename = rename as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOptions.mockReturnValue({
      patternflyOptions: {
        api: {
          expireDays: 1,
          endpoints: { v6: 'https://api.test/v6' }
        }
      },
      contextPath: '/test'
    });
  });

  describe('needsUpdate', () => {
    it('should return true if file does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      const result = await needsUpdate('/path/to/file', 1);
      expect(result).toBe(true);
    });

    it('should return true if file is older than expireDays', async () => {
      const oldTime = Date.now() - (2 * 24 * 60 * 60 * 1000);
      mockStat.mockResolvedValue({ mtimeMs: oldTime });
      const result = await needsUpdate('/path/to/file', 1);
      expect(result).toBe(true);
    });

    it('should return false if file is newer than expireDays', async () => {
      const newTime = Date.now() - (0.5 * 24 * 60 * 60 * 1000);
      mockStat.mockResolvedValue({ mtimeMs: newTime });
      const result = await needsUpdate('/path/to/file', 1);
      expect(result).toBe(false);
    });
  });

  describe('buildDocs', () => {
    it('should skip update if not forced and not expired', async () => {
      const newTime = Date.now();
      mockStat.mockResolvedValue({ mtimeMs: newTime });

      await buildDocs();

      expect(mockRunSpider).not.toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('up to date'));
    });

    it('should run spider and write file if forced', async () => {
      mockRunSpider.mockResolvedValue({ meta: {}, docs: {} });
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      await buildDocs({ force: true });

      expect(mockRunSpider).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockRename).toHaveBeenCalled();
    });

    it('should handle spider failures gracefully', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      mockRunSpider.mockRejectedValue(new Error('Spider error'));

      await buildDocs();

      expect(log.error).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Failed to build'));
    });
  });
});

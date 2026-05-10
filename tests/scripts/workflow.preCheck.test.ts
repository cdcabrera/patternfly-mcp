import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();

// Mock node:fs before importing the script
jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync
  }
}));

// Use dynamic imports to ensure mocks are applied
const fs = await import('node:fs');
const { coreContributors, signatureScan, coreContributorsBypass } = await import('../../scripts/workflow.preCheck.js');

describe('PR PreCheck Workflow Scripts', () => {

  describe('coreContributors()', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it.each([
      ['Bot', 'dependabot[bot]', true],
      ['User', 'dependabot[bot]', true],
      ['Bot', 'some-other-bot', true],
      ['User', 'some-user', false]
    ])('should handle bot authors (type: %s, author: %s) -> %s', (authorType, author, expected) => {
      const result = coreContributors({ author, authorType });
      expect(result).toBe(expected);
    });

    it.each([
      ['OWNER', true],
      ['MEMBER', true],
      ['COLLABORATOR', false],
      ['CONTRIBUTOR', false]
    ])('should identify maintainers by authorRole: %s -> %s', (authorRole, expected) => {
      const result = coreContributors({ authorRole });
      expect(result).toBe(expected);
    });

    it('should verify authors against CODEOWNERS file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('@patternfly-bot\n@maintainer-user');

      const result = coreContributors({ author: 'maintainer-user' });
      expect(result).toBe(true);
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('CODEOWNERS'), 'utf8');
    });
  });

  describe('signatureScan()', () => {
    const prTemplateMetadata = '<!-- GH_PR_METADATA_V1_789 -->';

    it.each([
      [20, true],
      [15, false],
      [10, false]
    ])('should flag PRs based on file count: %s -> %s', (fileCount, expected) => {
      const result = signatureScan({
        fileCount,
        description: prTemplateMetadata,
        files: []
      });
      expect(result.isMaxFilesUpdated).toBe(expected);
      if (expected) {
        expect(result.errors[0]).toContain(`updated a lot of files (${fileCount}/15)`);
      }
    });

    it('should detect core behavior modifications', () => {
      const files = [{ filename: 'src/server.ts' }];
      const result = signatureScan({
        fileCount: 1,
        description: prTemplateMetadata,
        files
      });
      expect(result.isSignatureModified).toBe(true);
      expect(result.errors[0]).toContain('core modifications to behavior (src/server.ts)');
    });

    it('should identify "The Tell" (breaking potential)', () => {
      const result = signatureScan({
        fileCount: 20, // isMaxFilesUpdated = true
        description: 'Modified template', // isPrTemplateModified = true (missing metadata)
        files: [
          { filename: 'src/server.ts' }, // matches src/server
          { filename: 'tests/e2e/utils/stdioTransportClient.ts' }, // matches tests/e2e/utils/stdioTransportClient.ts
          { filename: 'tests/e2e/__snapshots__/stdioTransport.test.ts.snap' } // matches tests/e2e/__snapshots__/stdioTransport.test.ts.snap
        ]
      });
      expect(result.hasTell).toBe(true);
    });
  });

  describe('coreContributorsBypass()', () => {
    it.each([
      ['/bypass', 'OWNER', true],
      ['/bypass ', 'MEMBER', true],
      [' /bypass', 'OWNER', true],
      ['/BYPASS', 'OWNER', true],
      ['/bypass', 'CONTRIBUTOR', false],
      ['hello', 'OWNER', false]
    ])('should handle bypass command: "%s" from %s -> %s', (body, authorRole, expected) => {
      const comments = [
        {
          body,
          author_association: authorRole,
          user: { login: 'some-user' }
        }
      ];
      const result = coreContributorsBypass({ comments });
      expect(result).toBe(expected);
    });
  });
});

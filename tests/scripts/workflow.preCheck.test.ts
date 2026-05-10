import fs from 'node:fs';
import { jest } from '@jest/globals';
import { coreContributors } from '../../scripts/workflow.preCheck.js';

describe('coreContributors', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      description: 'dependabot',
      params: {
        authorType: 'Bot',
        author: 'dependabot[bot]'
      },
      expected: true
    },
    {
      description: 'dependabot, user',
      params: {
        authorType: 'User',
        author: 'dependabot[bot]'
      },
      expected: true
    },
    {
      description: 'other bot',
      params: {
        authorType: 'Bot',
        author: 'lorem-ipsum-bot'
      },
      expected: true
    },
    {
      description: 'general user',
      params: {
        authorType: 'User',
        author: 'lorem-ipsum-user'
      },
      expected: false
    },
    {
      description: 'owner',
      params: {
        authorRole: 'OWNER',
        author: 'dolor-sit-user'
      },
      expected: true
    },
    {
      description: 'member',
      params: {
        authorRole: 'MEMBER',
        author: 'dolor-sit-user'
      },
      expected: false
    },
    {
      description: 'collaborator',
      params: {
        authorRole: 'COLLABORATOR',
        author: 'dolor-sit-user'
      },
      expected: false
    },
    {
      description: 'contributor',
      params: {
        authorRole: 'CONTRIBUTOR',
        author: 'dolor-sit-user'
      },
      expected: false
    }
  ])('should handle authors, $description', ({ params, expected }) => {
    const result = coreContributors(params);

    expect(result).toBe(expected);
  });

  it('should verify authors against CODEOWNERS file', () => {
    const mockExistsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockReadFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('package*.json @lorem');
    const result = coreContributors({ author: 'lorem', authorRole: 'MEMBER', authorType: 'User' });

    expect(result).toBe(true);
    expect(mockReadFileSyncSpy.mock.calls).toMatchSnapshot();
    // expect(mockReadFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining('CODEOWNERS'), 'utf8');
  });
});

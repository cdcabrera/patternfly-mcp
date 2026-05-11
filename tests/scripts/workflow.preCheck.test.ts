import fs from 'node:fs';
import { jest } from '@jest/globals';
import { coreContributors, coreContributorsBypass } from '../../scripts/workflow.preCheck.js';

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

  it.each([
    {
      description: 'codeowner, owner',
      account: '@lorem',
      params: {
        author: 'lorem', authorRole: 'OWNER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'owner',
      account: undefined,
      params: {
        author: 'lorem', authorRole: 'OWNER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'codeowner, member',
      account: '@lorem',
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'member',
      account: undefined,
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: false
    }
  ])('should verify authors against CODEOWNERS file, $description', ({ account, params, expected }) => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockReadFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(account ? `package*.json ${account} @dolor-sit` : 'package*.json @dolor-sit');
    const result = coreContributors(params);

    expect(result).toBe(expected);
    expect(mockReadFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining('CODEOWNERS'), 'utf8');
  });
});

describe('coreContributorsBypass', () => {
  it.each([
    {
      description: 'OWNER',
      body: '/bypass',
      authorRole: 'OWNER',
      expected: true
    },
    {
      description: 'OWNER, casing',
      body: '/BYPASS',
      authorRole: 'OWNER',
      expected: true
    },
    {
      description: 'OWNER, casing, spacing, copy',
      body: '  /BYPASS lorem ipsum dolor sit',
      authorRole: 'OWNER',
      expected: true
    },
    {
      description: 'OWNER, casing, spacing, copy with bypass',
      body: 'lorem ipsum dolor sit /BYPASS',
      authorRole: 'OWNER',
      expected: false
    },
    {
      description: 'OWNER, comment',
      body: 'lorem ipsum dolor sit',
      authorRole: 'OWNER',
      expected: false
    },
    {
      description: 'MEMBER',
      body: '/bypass',
      authorRole: 'MEMBER',
      expected: false
    },
    {
      description: 'CONTRIBUTOR',
      body: '/bypass',
      authorRole: 'CONTRIBUTOR',
      expected: false
    }
  ])('should handle a bypass command, $description', ({ body, authorRole, expected }) => {
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



import fs from 'node:fs';
import { jest } from '@jest/globals';
import {
  coreContributors,
  coreContributorsBypass,
  doesListContainAnotherListValues,
  signatureScan
} from '../../scripts/workflow.preCheck.js';

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

describe('doesListContainAnotherListValues', () => {
  it.each([
    {
      description: 'empty lists',
      listBase: [],
      listCheck: ['src/'],
      expected: []
    },
    {
      description: 'exact match',
      listBase: [{ filename: 'src/server.ts' }],
      listCheck: ['src/server.ts'],
      expected: ['src/server.ts']
    },
    {
      description: 'case insensitivity',
      listBase: [{ filename: 'src/SERVER.ts' }],
      listCheck: ['SRC/server.TS'],
      expected: ['src/SERVER.ts']
    },
    {
      description: 'prefix/directory match',
      listBase: [{ filename: 'src/cli.ts' }],
      listCheck: ['src/cli'],
      expected: ['src/cli.ts']
    },
    {
      description: 'contains match',
      listBase: [{ filename: 'some/path/scripts/workflow.script.js' }],
      listCheck: ['scripts/workflow'],
      expected: ['some/path/scripts/workflow.script.js']
    },
    {
      description: 'multiple matches',
      listBase: [
        { filename: 'src/server.ts' },
        { filename: 'tests/e2e/test.ts' }
      ],
      listCheck: ['src/', 'tests/e2e'],
      expected: ['src/server.ts', 'tests/e2e/test.ts']
    },
    {
      description: 'no match',
      listBase: [{ filename: 'README.md' }],
      listCheck: ['src/'],
      expected: []
    }
  ])('should verify list containment, $description', ({ listBase, listCheck, expected }) => {
    const result = doesListContainAnotherListValues(listBase, listCheck);

    expect(result).toEqual(expected);
  });
});

describe('signatureScan', () => {
  it.each([
    {
      description: 'valid PR',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: 'src/patternfly.ts' }],
        fileCount: 1
      },
      expected: 0
    },
    {
      description: 'too many files',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [],
        fileCount: 16
      },
      expected: 1
    },
    {
      description: 'missing template metadata',
      params: {
        description: 'Just a PR description',
        files: [],
        fileCount: 1
      },
      expected: 0
    },
    {
      description: 'core modifications',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: 'src/server.ts' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: 'security modifications',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: '.github/workflows/pr_precheck.yml' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: 'agent modifications',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: '.aiignore' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: 'extra/generated files',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: 'scripts/loremIpsum.sh' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: '"The Tell" (high impact check)',
      params: {
        description: 'Missing metadata',
        files: [
          { filename: 'src/server.ts' },
          { filename: 'tests/e2e/__snapshots__/stdioTransport.test.ts.snap' }
        ],
        fileCount: 20
      },
      expected: 2
    }
  ])('should scan for signatures, $description', ({ params, expected }) => {
    const result = signatureScan(params);

    expect(result.errors.length).toBe(expected);
    expect(result).toMatchSnapshot();
  });
});

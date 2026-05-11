import fs from 'node:fs';
import { jest } from '@jest/globals';
import {
  coreContributors,
  coreContributorsBypass,
  doesListContainAnotherListValues,
  signatureScan,
  getCommentId,
  getPullRequest,
  getReactions,
  setLabels,
  setComment,
  start
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
      description: '"The Tell"',
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

describe('getCommentId', () => {
  it('should return the ID of a comment matching the signature', async () => {
    const github = {
      rest: {
        issues: {
          listComments: jest.fn<any>().mockResolvedValue({
            data: [
              { id: 101, body: 'some other comment' },
              { id: 202, body: 'matching signature <!-- metadata-123 -->' }
            ]
          })
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const id = await getCommentId('<!-- metadata-123 -->', { github, context });

    expect(id).toBe(202);
  });
});

describe('getPullRequest', () => {
  it('should resolve and aggregate PR metadata and resources', async () => {
    const github = {
      rest: {
        pulls: { listFiles: jest.fn<any>().mockResolvedValue({ data: ['file1'] }) },
        issues: { listComments: jest.fn<any>().mockResolvedValue({ data: ['comment1'] }) }
      }
    };
    const context = {
      payload: {
        pull_request: {
          user: { login: 'author1', type: 'User' },
          author_association: 'MEMBER',
          body: 'description',
          changed_files: 10
        }
      },
      repo: { owner: 'lorem', repo: 'ipsum' },
      issue: { number: 1 }
    };

    const result = await getPullRequest({ github, context });

    expect(result).toMatchSnapshot('pr');
  });
});

describe('getReactions', () => {
  it.each([
    {
      description: 'thumbs up',
      content: '+1',
      expected: 1
    },
    {
      description: 'thumbs down',
      content: '-1',
      expected: -1
    },
    {
      description: 'heart',
      content: 'heart',
      expected: 0
    }
  ])('should get a reaction: $description', async ({ content, expected }) => {
    const github = {
      rest: {
        issues: { listComments: jest.fn<any>().mockResolvedValue({ data: [{ id: 1, body: 'sig' }] }) },
        reactions: {
          listForIssueComment: jest.fn<any>().mockResolvedValue({
            data: [{ user: { login: 'author1' }, content }]
          })
        }
      }
    } as any;
    const context = {
      payload: { pull_request: { user: { login: 'author1' } } },
      repo: { owner: 'lorem', repo: 'ipsum' },
      issue: { number: 1 }
    } as any;

    const { authorReaction } = await getReactions({ signature: 'sig', github, context });

    expect(authorReaction).toBe(expected);
  });
});

describe('setLabels', () => {
  it('should provide methods to add and remove labels', async () => {
    const github = {
      rest: {
        issues: {
          addLabels: jest.fn<any>().mockResolvedValue({}),
          removeLabel: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } } as any;

    const labels = setLabels({ github, context });

    await labels.add(['label-a']);
    await labels.remove(['label-b']);

    expect(github.rest.issues.addLabels).toHaveBeenCalled();
    expect(github.rest.issues.removeLabel).toHaveBeenCalled();
  });
});

describe('setComment', () => {
  it('should update an existing comment if a signature match is found', async () => {
    const github = {
      rest: {
        issues: {
          createComment: jest.fn<any>().mockResolvedValue({}),
          listComments: jest.fn<any>().mockResolvedValue({
            data: [{ id: 500, body: 'matching signature <!-- signature-123 -->' }]
          }),
          updateComment: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const comment = await setComment({ signature: '<!-- signature-123 -->', github, context });

    await comment.add('new body');

    expect(github.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({
      comment_id: 500,
      body: 'new body<!-- signature-123 -->'
    }));
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('should create a new comment if no signature match is found', async () => {
    const github = {
      rest: {
        issues: {
          createComment: jest.fn<any>().mockResolvedValue({}),
          listComments: jest.fn<any>().mockResolvedValue({ data: [] }),
          updateComment: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const comment = await setComment({ signature: '<!-- signature-123 -->', github, context });

    await comment.add('new body');

    expect(github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 1,
      body: 'new body<!-- signature-123 -->'
    }));
    expect(github.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it('should remove a comment if a signature match is found', async () => {
    const github = {
      rest: {
        issues: {
          listComments: jest.fn<any>().mockResolvedValue({ data: [{ id: 500, body: '<!-- signature-123 -->' }] }),
          deleteComment: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const comment = await setComment({ signature: '<!-- signature-123 -->', github, context });

    await comment.remove();

    expect(github.rest.issues.deleteComment).toHaveBeenCalledWith(expect.objectContaining({
      comment_id: 500
    }));
  });
});

describe('start', () => {
  let github: any;
  let context: any;
  let core: any;
  let config: any;

  beforeEach(() => {
    github = {
      rest: {
        pulls: { listFiles: jest.fn<any>().mockResolvedValue({ data: [] }) },
        issues: {
          listComments: jest.fn<any>().mockResolvedValue({ data: [] }),
          addLabels: jest.fn<any>().mockResolvedValue({}),
          removeLabel: jest.fn<any>().mockResolvedValue({}),
          createComment: jest.fn<any>().mockResolvedValue({}),
          updateComment: jest.fn<any>().mockResolvedValue({}),
          deleteComment: jest.fn<any>().mockResolvedValue({})
        },
        reactions: { listForIssueComment: jest.fn<any>().mockResolvedValue({ data: [] }) }
      },
      graphql: jest.fn<any>().mockResolvedValue({})
    };
    context = {
      payload: {
        pull_request: {
          user: { login: 'contributor', type: 'User' },
          author_association: 'CONTRIBUTOR',
          body: '<!-- GH_PR_METADATA_V1_789 -->',
          changed_files: 1,
          labels: []
        }
      },
      repo: { owner: 'o', repo: 'r' },
      issue: { number: 123 }
    };
    core = { setFailed: jest.fn(), log: jest.fn() };
    config = {
      isFreezeActive: false,
      LABEL_CODE_FREEZE: 'bot:freeze',
      LABEL_CONFIRMED: 'bot:confirmed',
      LABEL_UNCONFIRMED: 'bot:unconfirmed',
      LABEL_PRECHECKS_PASS: 'bot:pass',
      LABEL_BREAKING_POTENTIAL: 'bot:breaking',
      LABEL_NEEDS_CLEANUP: 'bot:cleanup',
      LABEL_SEC: 'bot:sec'
    };
  });

  it('should block and request a handshake if the contributor agreement is missing', async () => {
    await start(config, { github, context, core });

    expect(github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining("PR Contributor\'s Agreement")
    }));

    // Should stop before signature scan
    expect(github.rest.issues.addLabels).not.toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_PRECHECKS_PASS]
    }));
  });

  it('should proceed to code scanning once a 👍 reaction is detected', async () => {
    // 1. Existing agreement found
    github.rest.issues.listComments.mockResolvedValue({
      data: [{ id: 1, body: '<!-- precheck-bot-agreement-V1 -->' }]
    });

    // 2. Author has reacted with +1
    github.rest.reactions.listForIssueComment.mockResolvedValue({
      data: [{ user: { login: 'contributor' }, content: '+1' }]
    });

    await start(config, { github, context, core });

    expect(github.rest.issues.deleteComment).toHaveBeenCalled();
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_CONFIRMED]
    }));
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_PRECHECKS_PASS]
    }));
  });

  it('should lock automation and apply unconfirmed label if agreement is declined (👎)', async () => {
    github.rest.issues.listComments.mockResolvedValue({
      data: [{ id: 1, body: '<!-- precheck-bot-agreement-V1 -->' }]
    });
    github.rest.reactions.listForIssueComment.mockResolvedValue({
      data: [{ user: { login: 'contributor' }, content: '-1' }]
    });

    await start(config, { github, context, core });

    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_UNCONFIRMED]
    }));
    expect(github.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('🚫 I noticed you declined')
    }));
  });

  it('should clear old labels and notify success when all pre-checks pass', async () => {
    context.payload.pull_request.labels = [{ name: config.LABEL_CONFIRMED }];

    await start(config, { github, context, core });

    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_PRECHECKS_PASS]
    }));
    expect(github.rest.issues.removeLabel).toHaveBeenCalledWith(expect.objectContaining({
      name: config.LABEL_NEEDS_CLEANUP
    }));
  });
});

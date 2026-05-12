import { parseCommitMessage, messagesList, MESSAGE_TYPES } from '../../scripts/workflow.commitLint.js';

describe('parseCommitMessage', () => {
  it.each([
    {
      description: 'standard commit with type, scope, and PR',
      message: 'feat(core): add something (#123)',
      expected: {
        type: 'feat',
        scope: 'core',
        description: 'add something',
        prNumber: '123'
      }
    },
    {
      description: 'BUG: multiple colons in description (should not mutate description)',
      message: 'feat: check: missing colon (#789)',
      expected: {
        type: 'feat',
        description: 'check: missing colon',
        prNumber: '789'
      }
    },
    {
      description: 'BUG: greedy PR extraction (should not merge description numbers)',
      message: 'fix: resolve 500 error (#123)',
      expected: {
        type: 'fix',
        description: 'resolve 500 error',
        prNumber: '123'
      }
    },
    {
      description: 'breaking change with bang',
      message: 'feat(ui)!: breaking change',
      expected: {
        type: 'feat',
        isBreaking: true,
        description: 'breaking change'
      }
    },
    {
      description: 'fallback when type is invalid',
      message: 'unknown: some message',
      expected: {
        type: undefined,
        description: 'unknown: some message'
      }
    }
  ])('should parse $description', ({ message, expected }) => {
    const result = parseCommitMessage({ hash: 'abc1234', message }, MESSAGE_TYPES);

    expect(result).toMatchObject(expected);
  });
});

describe('messagesList', () => {
  it.each([
    {
      description: 'valid standard commit',
      parsed: [{
        type: 'feat',
        scope: 'any',
        description: 'JIRA-123 add feature',
        messageLength: 30,
        hash: 'abc1234',
        message: 'feat(any): JIRA-123 add feature'
      }],
      options: { typeScopeExceptions: [], issueNumberExceptions: [] },
      expected: {
        type: 'valid',
        issueNumber: 'valid'
      }
    },
    {
      description: 'BUG: validation masking (should show issue number error even if type is invalid)',
      parsed: [{
        type: undefined,
        scope: 'any',
        description: 'no issue here',
        messageLength: 30,
        hash: 'abc1234',
        message: 'foo(any): no issue here'
      }],
      options: { typeScopeExceptions: [], issueNumberExceptions: [] },
      expected: {
        type: expect.stringContaining('INVALID: type'),
        issueNumber: expect.stringContaining('INVALID: issue number')
      }
    },
    {
      description: 'BUG: brittle issue number regex (should allow issue number anywhere in description)',
      parsed: [{
        type: 'feat',
        scope: 'any',
        description: 'add feature (JIRA-123)',
        messageLength: 30,
        hash: 'abc1234',
        message: 'feat(any): add feature (JIRA-123)'
      }],
      options: { typeScopeExceptions: [], issueNumberExceptions: [] },
      expected: {
        issueNumber: 'valid'
      }
    },
    {
      description: 'message length validation',
      parsed: [{
        type: 'feat',
        description: 'very long description',
        messageLength: 100,
        hash: 'abc1234',
        message: 'feat: very long description'
      }],
      options: { maxMessageLength: 50 },
      expected: {
        length: 'INVALID: message length (100 > 50)'
      }
    },
    {
      description: 'typeScopeExceptions using wildcard',
      parsed: [{
        type: 'feat',
        scope: undefined,
        description: 'JIRA-123 desc',
        messageLength: 20,
        hash: 'abc1234'
      }],
      options: { typeScopeExceptions: '*' },
      expected: {
        scope: 'valid'
      }
    }
  ])('should validate $description', ({ parsed, options, expected }) => {
    const results = messagesList(parsed, options as any);

    expect(results[0]).toMatchObject(expected);
  });
});

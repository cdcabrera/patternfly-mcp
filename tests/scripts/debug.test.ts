import { parseCommitMessage, messagesList } from '../../scripts/workflow.commitLint.js';

describe('debug', () => {
  it('checks issue number extraction', () => {
    const parsed: any = parseCommitMessage({ hash: 'abc', message: 'feat: add feature (JIRA-123)' });
    console.log('Parsed Object:', JSON.stringify(parsed, null, 2));
    const validated: any = messagesList([parsed], { issueNumberExceptions: [], typeScopeExceptions: '*', maxMessageLength: 65 } as any);
    console.log('Validated issueNumber:', validated[0].issueNumber);
  });
});
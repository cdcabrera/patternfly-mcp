import {
  registerSkillArtifacts,
  getSkillArtifact,
  clearSkillArtifactsForSession
} from '../server.skillArtifacts';

describe('server.skillArtifacts', () => {
  const sessionId = 'test-session-skill-artifacts';

  afterEach(() => {
    clearSkillArtifactsForSession(sessionId);
  });

  it('stores and retrieves valid patternfly://skills/ entries', () => {
    registerSkillArtifacts(sessionId, {
      'patternfly://skills/wf-1': { mimeType: 'text/markdown', text: 'full body' }
    });

    expect(getSkillArtifact(sessionId, 'patternfly://skills/wf-1')?.text).toBe('full body');
  });

  it('ignores invalid URIs and malformed bodies', () => {
    registerSkillArtifacts(sessionId, {
      'https://example.com/x': { mimeType: 'text/markdown', text: 'nope' },
      'patternfly://skills/good': { mimeType: 'text/markdown', text: 'yes' },
      'patternfly://skills/bad': { mimeType: 1 as unknown as string, text: 'x' }
    });

    expect(getSkillArtifact(sessionId, 'https://example.com/x')).toBeUndefined();
    expect(getSkillArtifact(sessionId, 'patternfly://skills/good')?.text).toBe('yes');
    expect(getSkillArtifact(sessionId, 'patternfly://skills/bad')).toBeUndefined();
  });

  it('clears session data', () => {
    registerSkillArtifacts(sessionId, {
      'patternfly://skills/a': { mimeType: 'text/markdown', text: 'a' }
    });
    clearSkillArtifactsForSession(sessionId);
    expect(getSkillArtifact(sessionId, 'patternfly://skills/a')).toBeUndefined();
  });
});

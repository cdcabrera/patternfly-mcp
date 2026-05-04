import {
  patternFlySkillsResource,
  resourceCallback
} from '../resource.patternFlySkills';
import { registerSkillArtifacts, clearSkillArtifactsForSession } from '../server.skillArtifacts';
import { isPlainObject } from '../server.helpers';
import { runWithSession, setSessionOptions } from '../options.context';

describe('patternFlySkillsResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlySkillsResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('resource.patternFlySkills resourceCallback', () => {
  const session = setSessionOptions();

  afterEach(() => {
    clearSkillArtifactsForSession(session.sessionId);
  });

  it('returns unavailable markdown when nothing is registered', async () => {
    await runWithSession(session, async () => {
      const result = await resourceCallback(new URL('patternfly://skills/missing-id'), {
        id: 'missing-id'
      });

      const first = result.contents[0];

      expect(first).toBeDefined();
      expect(first?.mimeType).toBe('text/markdown');
      expect(first?.text).toContain('Skill artifact unavailable');
    });
  });

  it('returns registered full body', async () => {
    await runWithSession(session, async () => {
      registerSkillArtifacts(session.sessionId, {
        'patternfly://skills/wf-ref-1': { mimeType: 'text/markdown', text: '# Reference full\n\nBody' }
      });

      const result = await resourceCallback(new URL('patternfly://skills/wf-ref-1'), {
        id: 'wf-ref-1'
      });

      expect(result.contents[0]?.text).toBe('# Reference full\n\nBody');
    });
  });
});

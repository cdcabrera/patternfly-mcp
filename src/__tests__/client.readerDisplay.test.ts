import { prepareReaderDisplay } from '../client/client.helpers';

describe('prepareReaderDisplay', () => {
  it('uses the first markdown heading for the title and strips provenance', () => {
    const raw = [
      '<!-- mcp:provenance id="af066c0c" groupId="40b815b1" -->',
      '',
      '# Documentation for Component Groups Close Button - Examples (v6)',
      '',
      'Body paragraph.'
    ].join('\n');

    const { titleLine, body } = prepareReaderDisplay(raw, 'patternfly://docs/x');

    expect(titleLine).toBe('Documentation for Component Groups Close Button - Examples (v6)');
    expect(body).not.toContain('mcp:provenance');
    expect(body).not.toContain('# Documentation for Component Groups');
    expect(body).toContain('Body paragraph.');
  });
});

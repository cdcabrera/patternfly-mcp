import { materializeResourceText } from '../client/client.transport';

describe('materializeResourceText', () => {
  it('joins multiple text contents', () => {
    expect(materializeResourceText([
      { uri: 'a', mimeType: 'text/markdown', text: 'Part one' },
      { uri: 'b', mimeType: 'text/markdown', text: 'Part two' }
    ])).toBe('Part one\n\n---\n\nPart two');
  });

  it('returns guidance when no text is present', () => {
    expect(materializeResourceText([])).toContain('No readable text');
  });
});

import { resolveKeyToken } from '../client/client.input';

describe('resolveKeyToken', () => {
  it('maps key.name when str is empty', () => {
    expect(resolveKeyToken('', { name: 'c' } as never)).toBe('c');
    expect(resolveKeyToken('', { name: 'q' } as never)).toBe('q');
  });

  it('maps space to pagedown', () => {
    expect(resolveKeyToken(' ', { name: 'space' } as never)).toBe('pagedown');
    expect(resolveKeyToken('', { name: 'space' } as never)).toBe('pagedown');
  });
});

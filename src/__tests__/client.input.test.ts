import { resolveKeyToken } from '../client/client.input';

describe('resolveKeyToken', () => {
  it('maps key.name when str is empty', () => {
    expect(resolveKeyToken('', { name: 'c' } as never)).toBe('c');
    expect(resolveKeyToken('', { name: 'q' } as never)).toBe('q');
  });

  it('maps space to space', () => {
    expect(resolveKeyToken(' ', { name: 'space' } as never)).toBe('space');
    expect(resolveKeyToken('', { name: 'space' } as never)).toBe('space');
  });

  it('maps navigation and filter keys', () => {
    expect(resolveKeyToken('', { name: 'right' } as never)).toBe('right');
    expect(resolveKeyToken('', { name: 'left' } as never)).toBe('left');
    expect(resolveKeyToken('', { name: 'tab' } as never)).toBe('tab');
    expect(resolveKeyToken('', { name: 'up' } as never)).toBe('up');
    expect(resolveKeyToken('', { name: 'down' } as never)).toBe('down');
  });
});

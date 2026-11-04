import { resolveKeyToken } from '../client.input';

describe('resolveKeyToken', () => {
  it.each([
    {
      description: 'single letter, copy',
      input: '',
      metadata: { name: 'c' }
    },
    {
      description: 'single letter, quit',
      input: '',
      metadata: { name: 'q' }
    },
    {
      description: 'no space input, space',
      input: '',
      metadata: { name: 'space' }
    },
    {
      description: 'empty space input, space',
      input: ' ',
      metadata: { name: 'space' }
    },
    {
      description: 'right',
      input: '',
      metadata: { name: 'right' }
    },
    {
      description: 'left',
      input: '',
      metadata: { name: 'left' }
    },
    {
      description: 'tab',
      input: '',
      metadata: { name: 'tab' }
    },
    {
      description: 'up',
      input: '',
      metadata: { name: 'up' }
    },
    {
      description: 'down',
      input: '',
      metadata: { name: 'down' }
    }
  ])('should return key tokens, $description', ({ input, metadata }) => {
    expect(resolveKeyToken({ str: input, key: metadata })).toBe(metadata?.name);
  });
});

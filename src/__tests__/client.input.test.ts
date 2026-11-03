let keyHandler: ((name: string) => void) | null = null;
const mockGrabInput = jest.fn();
const mockOnce = jest.fn().mockImplementation((event: string, callback: (name: string) => void) => {
  if (event === 'key') {
    keyHandler = callback;
  }
});
const mockInputField = jest.fn().mockImplementation(({ default: def }: { default?: string } = {}) => ({
  promise: Promise.resolve(def ? `  ${def}  ` : '  query  ')
}));

const mockTerm: any = jest.fn();

mockTerm.grabInput = mockGrabInput;
mockTerm.once = mockOnce;
mockTerm.inputField = mockInputField;

jest.mock('terminal-kit', () => ({
  terminal: mockTerm
}));

import { createKeyReader, promptLine } from '../client/client.input';

describe('client.input', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    keyHandler = null;
  });

  describe('createKeyReader', () => {
    it('initializes input grabbing and handles enable, disable, dispose', () => {
      const reader = createKeyReader();

      expect(mockGrabInput).toHaveBeenCalledWith({ mouse: false });

      reader.enable();
      expect(mockGrabInput).toHaveBeenCalledWith({ mouse: false });

      reader.disable();
      expect(mockGrabInput).toHaveBeenCalledWith(false);

      reader.dispose();
      expect(mockGrabInput).toHaveBeenCalledWith(false);
    });

    it('maps key tokens when readKey is invoked', async () => {
      const reader = createKeyReader();

      const testMappings: Array<[string, string]> = [
        ['CTRL_C', 'ctrl-c'],
        ['UP', 'up'],
        ['DOWN', 'down'],
        ['LEFT', 'left'],
        ['RIGHT', 'right'],
        ['TAB', 'tab'],
        ['PAGE_UP', 'pageup'],
        ['PAGE_DOWN', 'pagedown'],
        [' ', 'space'],
        ['ENTER', 'enter'],
        ['ESCAPE', 'esc'],
        ['Q', 'q'],
        ['c', 'c']
      ];

      for (const [inputKey, expectedToken] of testMappings) {
        const promise = reader.readKey();

        expect(mockOnce).toHaveBeenCalledWith('key', expect.any(Function));
        keyHandler!(inputKey);

        const result = await promise;

        expect(result).toBe(expectedToken);
      }
    });
  });

  describe('promptLine', () => {
    it('prompts the user with inputField and returns trimmed result', async () => {
      const result = await promptLine('Search query', 'button');

      expect(mockTerm).toHaveBeenCalledWith('\n  ^c◇^ Search query: ');
      expect(mockInputField).toHaveBeenCalledWith({ default: 'button' });
      expect(mockTerm).toHaveBeenCalledWith('\n');
      expect(result).toBe('button');
    });

    it('falls back to current default if inputField resolves to empty/whitespace', async () => {
      mockInputField.mockReturnValueOnce({
        promise: Promise.resolve('   ')
      });

      const result = await promptLine('Search query', 'default-val');

      expect(result).toBe('default-val');
    });
  });
});

import { main, start, type CliOptions } from '../index';
import { parseCliOptions, type GlobalOptions } from '../options';
import { DEFAULT_OPTIONS } from '../options.defaults';
import { setOptions } from '../options.context';
import { runServer } from '../server';

// Mock dependencies
jest.mock('../options');
jest.mock('../options.context');
jest.mock('../server');

const mockParseCliOptions = parseCliOptions as jest.MockedFunction<typeof parseCliOptions>;
const mockSetOptions = setOptions as jest.MockedFunction<typeof setOptions>;
const mockRunServer = runServer as jest.MockedFunction<typeof runServer>;

describe('main', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let callOrder: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    callOrder = [];

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup default mocks
    mockParseCliOptions.mockImplementation(() => {
      callOrder.push('parse');

      return { docsHost: false };
    });
    mockSetOptions.mockImplementation(options => {
      callOrder.push('set');

      return Object.freeze({ ...DEFAULT_OPTIONS, ...options }) as unknown as GlobalOptions;
    });
    mockRunServer.mockImplementation(async () => {
      callOrder.push('run');

      return {
        stop: jest.fn().mockResolvedValue(undefined),
        isRunning: jest.fn().mockReturnValue(true)
      };
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should handle server startup errors', async () => {
    const error = new Error('Server failed to start');

    mockRunServer.mockRejectedValue(error);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      description: 'parseCliOptions',
      error: new Error('Failed to parse CLI options'),
      message: 'Failed to start server:'
    },
    {
      description: 'setOptions',
      error: new Error('Failed to set options'),
      message: 'Failed to start server:'
    }
  ])('should handle errors, $description', async ({ error, message }) => {
    mockSetOptions.mockImplementation(() => {
      throw error;
    });

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(message, error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      description: 'merge programmatic options with CLI options',
      programmaticOptions: { docsHost: true },
      cliOptions: { docsHost: false }
    },
    {
      description: 'with empty programmatic options',
      programmaticOptions: {},
      cliOptions: { docsHost: true }
    },
    {
      description: 'with undefined programmatic options',
      programmaticOptions: undefined,
      cliOptions: { docsHost: false }
    }
  ])('should merge default, cli and programmatic options, $description', async ({ programmaticOptions, cliOptions }) => {
    mockParseCliOptions.mockImplementation(() => {
      callOrder.push('parse');

      return cliOptions;
    });

    await main(programmaticOptions);

    expect({
      sequence: callOrder,
      calls: mockSetOptions.mock.calls
    }).toMatchSnapshot();
  });
});

describe('start alias', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup default mocks
    mockParseCliOptions.mockReturnValue({ docsHost: false });
    mockSetOptions.mockImplementation(options =>
      Object.freeze({ ...DEFAULT_OPTIONS, ...options }) as unknown as GlobalOptions);
    mockRunServer.mockResolvedValue({
      stop: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true)
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should be equivalent to main function', async () => {
    const cliOptions = { docsHost: true };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await start();

    expect(mockParseCliOptions).toHaveBeenCalled();
    expect(mockSetOptions).toHaveBeenCalledWith(cliOptions);
    expect(mockRunServer).toHaveBeenCalled();
  });

  it('should accept programmatic options like main', async () => {
    const cliOptions = { docsHost: false };
    const programmaticOptions = { docsHost: true };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await start(programmaticOptions);

    expect(mockSetOptions).toHaveBeenCalledWith(programmaticOptions);
  });
});

describe('type exports', () => {
  it('should export CliOptions type', () => {
    // TypeScript compilation will fail if the type is unavailable
    const options: Partial<CliOptions> = { docsHost: true };

    expect(options).toBeDefined();
  });
});


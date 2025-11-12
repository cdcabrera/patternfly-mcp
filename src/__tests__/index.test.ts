import { main, start, type CliOptions } from '../index';
import { parseCliOptions, createOptions, type GlobalOptions } from '../options';
import { setOptions } from '../options.context';
import { runServer } from '../server';

// Mock dependencies
jest.mock('../options');
jest.mock('../options.context');
jest.mock('../server');

const mockParseCliOptions = parseCliOptions as jest.MockedFunction<typeof parseCliOptions>;
const mockCreateOptions = createOptions as jest.MockedFunction<typeof createOptions>;
const mockSetOptions = setOptions as jest.MockedFunction<typeof setOptions>;
const mockRunServer = runServer as jest.MockedFunction<typeof runServer>;

describe('main', () => {
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
    mockCreateOptions.mockReturnValue({} as GlobalOptions);
    mockSetOptions.mockImplementation(() => {});
    mockRunServer.mockResolvedValue({
      stop: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true)
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should create and set options with parsed CLI options', async () => {
    const cliOptions = { docsHost: true };
    const createdOptions = { docsHost: true } as GlobalOptions;

    mockParseCliOptions.mockReturnValue(cliOptions);
    mockCreateOptions.mockReturnValue(createdOptions);

    await main();

    expect(mockCreateOptions).toHaveBeenCalledWith(cliOptions);
    expect(mockSetOptions).toHaveBeenCalledWith(createdOptions);
  });

  it('should attempt to parse CLI options and run the server', async () => {
    await main();

    expect(mockParseCliOptions).toHaveBeenCalled();
    expect(mockRunServer).toHaveBeenCalled();
  });

  it('should handle server startup errors', async () => {
    const error = new Error('Server failed to start');

    mockRunServer.mockRejectedValue(error);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle parseCliOptions errors', async () => {
    const error = new Error('Failed to parse CLI options');

    mockParseCliOptions.mockImplementation(() => {
      throw error;
    });

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle createOptions errors', async () => {
    const error = new Error('Failed to create options');

    mockCreateOptions.mockImplementation(() => {
      throw error;
    });

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should execute steps in correct order', async () => {
    const callOrder: string[] = [];

    mockParseCliOptions.mockImplementation(() => {
      callOrder.push('parse');

      return { docsHost: false };
    });

    mockCreateOptions.mockImplementation(() => {
      callOrder.push('create');

      return {} as GlobalOptions;
    });

    mockSetOptions.mockImplementation(() => {
      callOrder.push('set');
    });

    mockRunServer.mockImplementation(async () => {
      callOrder.push('run');

      return {
        stop: jest.fn().mockResolvedValue(undefined),
        isRunning: jest.fn().mockReturnValue(true)
      };
    });

    await main();

    expect(callOrder).toEqual(['parse', 'create', 'set', 'run']);
  });

  it('should merge programmatic options with CLI options', async () => {
    const cliOptions = { docsHost: false };
    const programmaticOptions = { docsHost: true };
    const mergedOptions = { docsHost: true } as GlobalOptions;

    mockParseCliOptions.mockReturnValue(cliOptions);
    mockCreateOptions.mockReturnValue(mergedOptions);

    await main(programmaticOptions);

    // Should merge CLI options with programmatic options (programmatic takes precedence)
    expect(mockCreateOptions).toHaveBeenCalledWith({ docsHost: true });
    expect(mockSetOptions).toHaveBeenCalledWith(mergedOptions);
  });

  it('should work with empty programmatic options', async () => {
    const cliOptions = { docsHost: true };
    const createdOptions = { docsHost: true } as GlobalOptions;

    mockParseCliOptions.mockReturnValue(cliOptions);
    mockCreateOptions.mockReturnValue(createdOptions);

    await main({});

    expect(mockCreateOptions).toHaveBeenCalledWith({ docsHost: true });
    expect(mockSetOptions).toHaveBeenCalledWith(createdOptions);
  });

  it('should work with undefined programmatic options', async () => {
    const cliOptions = { docsHost: false };
    const createdOptions = { docsHost: false } as GlobalOptions;

    mockParseCliOptions.mockReturnValue(cliOptions);
    mockCreateOptions.mockReturnValue(createdOptions);

    await main();

    expect(mockCreateOptions).toHaveBeenCalledWith({ docsHost: false });
    expect(mockSetOptions).toHaveBeenCalledWith(createdOptions);
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
    mockCreateOptions.mockReturnValue({} as GlobalOptions);
    mockSetOptions.mockImplementation(() => {});
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
    const createdOptions = { docsHost: true } as GlobalOptions;

    mockParseCliOptions.mockReturnValue(cliOptions);
    mockCreateOptions.mockReturnValue(createdOptions);

    await start();

    expect(mockParseCliOptions).toHaveBeenCalled();
    expect(mockCreateOptions).toHaveBeenCalledWith(cliOptions);
    expect(mockSetOptions).toHaveBeenCalledWith(createdOptions);
    expect(mockRunServer).toHaveBeenCalled();
  });

  it('should accept programmatic options like main', async () => {
    const cliOptions = { docsHost: false };
    const programmaticOptions = { docsHost: true };
    const mergedOptions = { docsHost: true } as GlobalOptions;

    mockParseCliOptions.mockReturnValue(cliOptions);
    mockCreateOptions.mockReturnValue(mergedOptions);

    await start(programmaticOptions);

    expect(mockCreateOptions).toHaveBeenCalledWith({ docsHost: true });
    expect(mockSetOptions).toHaveBeenCalledWith(mergedOptions);
  });
});

describe('type exports', () => {
  it('should export CliOptions type', () => {
    // This test ensures the type is properly exported
    // TypeScript compilation will fail if the type is not available
    const options: Partial<CliOptions> = { docsHost: true };

    expect(options).toBeDefined();
  });
});


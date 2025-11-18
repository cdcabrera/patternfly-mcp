import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getProcessOnPort, SAME_SERVER_TOKENS, isSameMcpServer, killProcess, formatPortConflictError, startHttpTransport } from '../server.http';
import { type GlobalOptions } from '../options';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js');
jest.mock('node:http');
jest.mock('pid-port', () => ({
  __esModule: true,
  portToPid: jest.fn().mockImplementation(async () => 123456789)
}));
jest.mock('fkill', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(Promise.resolve())
}));

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStreamableHTTPServerTransport = StreamableHTTPServerTransport as jest.MockedClass<typeof StreamableHTTPServerTransport>;
const MockCreateServer = createServer as jest.MockedFunction<typeof createServer>;

describe('getProcessOnPort', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attempt to find a process listening on a port', async () => {
    await expect(getProcessOnPort(3000)).resolves.toMatchSnapshot('ps fallback');
  });
});

describe('SAME_SERVER_TOKENS', () => {
  it('should list predictable values', () => {
    expect(SAME_SERVER_TOKENS).toMatchSnapshot();
  });
});

describe('isSameMcpServer', () => {
  it.each([
    {
      description: 'match "true" against --http variations',
      param: [
        '--http node dist/index.js',
        '/home/user/projects/patternfly-mcp/dist/index.js --http',
        '/usr/local/bin/patternfly-mcp --http',
        '/opt/pf-mcp/bin/pf-mcp --http',
        'pf-mcp --http --port 8080',
        'pf-mcp --port 3000 --http',
        'pfmcp --http',
        'patternfly-mcp --http --port 3000',
        'node dist/index.js --http',
        'node dist/index.js --http ',
        ' node dist/index.js --http',
        'node dist/index.js --http --port 3000'
      ],
      expected: true
    },
    {
      description: 'match "false" against missing or substring or different processes with --http',
      param: [
        'node dist/index.js',
        'pf-mcp',
        'patternfly-mcp --port 3000',
        'patternfly-mcp',
        '/usr/bin/grep patternfly-mcp',
        'cat dist/index.js',
        'echo "pf-mcp is great"',
        'node dist/index.js --http-port 3000',
        'patternfly-mcp --no-http',
        'node other-server.js --http',
        'python server.py --http',
        'nginx --http'
      ],
      expected: false
    },
    {
      description: 'match "true" against npx',
      param: [
        'npx @patternfly/patternfly-mcp --http',
        'npx patternfly-mcp --http --port 3000'
      ],
      expected: true
    },
    {
      description: 'match "true" against Windows paths and extra spaces',
      param: [
        'node C:\\proj\\dist\\index.js    --http   ',
        'C:\\Users\\App\\patternfly-mcp.exe --http --port 3000'
      ],
      expected: true
    },
    {
      description: 'match "true" against case insensitivity',
      param: [
        'NODE DIST/INDEX.JS --HTTP',
        'PATTERNFLY-MCP --HTTP',
        'PF-MCP --HTTP'
      ],
      expected: true
    },
    {
      description: 'match "false" against empty or falsy input',
      param: [
        '',
        '   '
      ],
      expected: false
    }
  ])('should determine if the process is the MCP server instance, $description', ({ expected, param }) => {
    const updatedParams = Array.isArray(param) ? param : [param];

    updatedParams.map(param => {
      expect(isSameMcpServer(param)).toBe(expected);
    });
  });
});

describe('killProcess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attempt to kill a process', async () => {
    await expect(killProcess(123456789)).resolves.toBe(true);
  });
});

describe('formatPortConflictError', () => {
  it.each([
    {
      description: 'is same mcp server',
      port: 3000,
      processInfo: { pid: 123456789, command: 'node dist/index.js --http' }
    },
    {
      description: 'is NOT the same mcp server',
      port: 3000,
      processInfo: { pid: 987654321, command: 'node dist/index.js' }
    },
    {
      description: 'processInfo is missing',
      port: 3000,
      processInfo: undefined
    }
  ])('should return a formatted message, $description', ({ port, processInfo }) => {
    expect(formatPortConflictError(port, processInfo)).toMatchSnapshot();
  });
});

describe('startHttpTransport', () => {
  const mockFunction = jest.fn();
  const mockEventHandler = jest.fn();
  const mockServerClose = jest.fn();
  let mockServer: any;
  let mockHttpServer: any;
  let mockTransport: any;

  beforeEach(() => {
    mockServer = {
      connect: mockFunction,
      registerTool: mockFunction
    };
    mockHttpServer = {
      on: mockEventHandler,
      listen: mockFunction.mockImplementation((_port: any, _host: any, callback: any) => {
        if (callback) {
          callback();
        }
      }),
      close: mockServerClose.mockImplementation((callback: any) => {
        callback();
      })
    };
    mockTransport = {
      handleRequest: jest.fn(),
      sessionId: 'test-session-123'
    };

    MockMcpServer.mockImplementation(() => mockServer);
    MockStreamableHTTPServerTransport.mockImplementation(() => mockTransport);
    MockCreateServer.mockReturnValue(mockHttpServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should start HTTP server, with port and host', async () => {
    const server = await startHttpTransport(mockServer, { port: 3000, host: 'localhost' } as GlobalOptions);

    await server.close();

    expect({
      setupServer: mockFunction.mock.calls,
      setupTransport: MockStreamableHTTPServerTransport.mock.calls,
      setupHandlers: mockEventHandler.mock.calls,
      serverClose: mockServerClose.mock.calls
    }).toMatchSnapshot('server setup');
  });

  it.each([
    {
      description: 'with invalid port',
      options: { port: undefined, host: 'localhost' },
      error: 'are required for HTTP transport'
    },
    {
      description: 'with invalid host',
      options: { port: 3000, host: undefined },
      error: 'are required for HTTP transport'
    },
    {
      description: 'with option killExisting and missing processInfo',
      options: { port: 3000, host: 'localhost', killExisting: true },
      error: 'is in use by a different process'
    }
  ])('should handle option errors, $description', async ({ error, options }) => {
    await expect(startHttpTransport(mockServer, options as any)).rejects.toThrow(error);
  });

  it.each([
    {
      description: 'with server error',
      options: { port: 3000, host: 'localhost' },
      error: 'are required for HTTP transport'
    }
  ])('should handle server errors, $description', async ({ error, options }) => {
    MockCreateServer.mockImplementation(() => {
      throw new Error('frank');
    });

    await expect(startHttpTransport(mockServer, options as any)).rejects.toThrow(error);
  });
});

/*
describe('startHttpTransport', () => {
  const mockFunction = jest.fn();
  const mockEventHandler = jest.fn();
  const mockServerClose = jest.fn();
  let mockServer: any;
  let mockTransport: any;

  beforeEach(() => {
    mockServer = {
      connect: mockFunction,
      registerTool: mockFunction
    };

    mockTransport = {
      handleRequest: jest.fn(),
      sessionId: 'test-session-123'
    };

    MockStreamableHTTPServerTransport.mockImplementation(() => mockTransport);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with port and host',
      options: { port: 3000, host: 'localhost' }
    }
  ])('should start HTTP server, $description', async ({ options }) => {
    const server = await startHttpTransport(mockServer, options as GlobalOptions);

    await server.close();

    expect({
      setupServer: mockFunction.mock.calls,
      setupTransport: MockStreamableHTTPServerTransport.mock.calls,
      setupHandlers: mockEventHandler.mock.calls,
      serverClose: mockServerClose.mock.calls
    }).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with invalid port',
      options: { port: undefined, host: 'localhost' },
      error: 'are required for HTTP transport'
    },
    {
      description: 'with invalid host',
      options: { port: 3000, host: undefined },
      error: 'are required for HTTP transport'
    },
    {
      description: 'with option killExisting and missing processInfo',
      options: { port: 3000, host: 'localhost', killExisting: true },
      error: 'is in use by a different process'
    }
  ])('should handle option errors, $description', async ({ error, options }) => {
    await expect(startHttpTransport(mockServer, options as any)).rejects.toThrow(error);
  });
});
*/

/*
describe('startHttpTransport', () => {
  const mockFunction = jest.fn();
  const mockEventHandler = jest.fn();
  const mockServerClose = jest.fn();
  let mockServer: any;
  let mockTransport: any;
  let mockHttpServer: any;

  beforeEach(() => {
    mockServer = {
      connect: mockFunction,
      registerTool: mockFunction
    };
    mockTransport = {
      handleRequest: jest.fn(),
      sessionId: 'test-session-123'
    };
    mockHttpServer = {
      on: mockEventHandler,
      listen: mockFunction.mockImplementation((_port: any, _host: any, callback: any) => {
        if (callback) {
          callback();
        }
      }),
      close: mockServerClose.mockImplementation((callback: any) => {
        callback();
      })
    };

    MockMcpServer.mockImplementation(() => mockServer);
    MockStreamableHTTPServerTransport.mockImplementation(() => mockTransport);
    MockCreateServer.mockReturnValue(mockHttpServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with port and host',
      options: { port: 3000, host: 'localhost' }
    }
  ])('should start HTTP server, $description', async ({ options }) => {
    const server = await startHttpTransport(mockServer, options as GlobalOptions);

    await server.close();

    expect({
      setupServer: mockFunction.mock.calls,
      setupTransport: MockStreamableHTTPServerTransport.mock.calls,
      setupHandlers: mockEventHandler.mock.calls,
      serverClose: mockServerClose.mock.calls
    }).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with invalid port',
      options: { port: undefined, host: 'localhost' },
      error: 'are required for HTTP transport'
    },
    {
      description: 'with invalid host',
      options: { port: 3000, host: undefined },
      error: 'are required for HTTP transport'
    },
    {
      description: 'with option killExisting and missing processInfo',
      options: { port: 3000, host: 'localhost', killExisting: true },
      error: 'is in use by a different process'
    }
  ])('should handle option errors, $description', async ({ error, options }) => {
    await expect(startHttpTransport(mockServer, options as any)).rejects.toThrow(error);
  });

  it.each([
    {
      description: 'with server error',
      options: { port: 3000, host: 'localhost' },
      error: 'are required for HTTP transport'
    }
  ])('should handle server errors, $description', async ({ error, options }) => {
    MockCreateServer.mockImplementation(() => {
      throw new Error('frank');
    });

    await expect(startHttpTransport(mockServer, options as any)).rejects.toThrow(error);
  });

  /*
  describe('startHttpTransport', () => {


    it('should handle server errors', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      const error = new Error('Server error');

      mockHttpServer.listen.mockImplementation((_port: any, _host: any, _callback: any) => {
        mockHttpServer.on.mockImplementation((event: any, handler: any) => {
          if (event === 'error') {
            handler(error);
          }
        });
        throw error;
      });

      await expect(startHttpTransport(mockServer, options)).rejects.toThrow('Server error');
    });


  });

  describe('HTTP request handling', () => {
    it('should delegate requests to StreamableHTTPServerTransport', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      // Mock request and response
      const mockReq = {
        method: 'GET',
        url: '/mcp',
        headers: { host: 'localhost:3000' }
      };
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn()
      };

      // Call the transport's handleRequest method directly
      await mockTransport.handleRequest(mockReq, mockRes);

      // Verify transport handles the request
      expect(mockTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('should handle all HTTP methods through transport', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      // Test different HTTP methods
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

      for (const method of methods) {
        const mockReq = {
          method,
          url: '/mcp',
          headers: { host: 'localhost:3000' }
        };
        const mockRes = {
          setHeader: jest.fn(),
          writeHead: jest.fn(),
          end: jest.fn()
        };

        await mockTransport.handleRequest(mockReq, mockRes);
        expect(mockTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes);
      }
    });

    it('should handle transport errors gracefully', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      // Mock transport error
      const transportError = new Error('Transport error');

      mockTransport.handleRequest.mockRejectedValue(transportError);

      const mockReq = {
        method: 'GET',
        url: '/mcp',
        headers: { host: 'localhost:3000' }
      };
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn()
      };

      // Should throw - transport errors are propagated
      await expect(mockTransport.handleRequest(mockReq, mockRes)).rejects.toThrow('Transport error');
    });
  });

  describe('StreamableHTTPServerTransport configuration', () => {
    it('should use crypto.randomUUID for session ID generation', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.sessionIdGenerator).toBeDefined();
      expect(typeof transportOptions?.sessionIdGenerator).toBe('function');

      // Test that it generates UUIDs
      const sessionId = transportOptions?.sessionIdGenerator?.();

      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should configure session callbacks', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.onsessioninitialized).toBeDefined();
      expect(transportOptions?.onsessionclosed).toBeDefined();
      expect(typeof transportOptions?.onsessioninitialized).toBe('function');
      expect(typeof transportOptions?.onsessionclosed).toBe('function');
    });

    it('should enable SSE streaming', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.enableJsonResponse).toBe(false);
    });

    it('should enable DNS rebinding protection', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.enableDnsRebindingProtection).toBe(true);
    });
  });
  */
// });

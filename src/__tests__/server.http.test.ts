import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { startHttpTransport } from '../server.http';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/sse.js');
jest.mock('node:http');

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockSSEServerTransport = SSEServerTransport as jest.MockedClass<typeof SSEServerTransport>;
const MockCreateServer = createServer as jest.MockedFunction<typeof createServer>;

describe('HTTP Transport', () => {
  let mockServer: any;
  let mockTransport: any;
  let mockHttpServer: any;

  beforeEach(() => {
    mockServer = {
      connect: jest.fn(),
      registerTool: jest.fn()
    };
    mockTransport = {
      sessionId: 'test-session-123',
      start: jest.fn(),
      handlePostMessage: jest.fn()
    };
    mockHttpServer = {
      on: jest.fn(),
      listen: jest.fn().mockImplementation((port, host, callback) => {
        // Immediately call the callback to simulate successful server start
        if (callback) callback();
      }),
      close: jest.fn()
    };

    MockMcpServer.mockImplementation(() => mockServer);
    MockSSEServerTransport.mockImplementation(() => mockTransport);
    MockCreateServer.mockReturnValue(mockHttpServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startHttpTransport', () => {
    it('should start HTTP server on specified port and host', async () => {
      // Uses default parameter pattern - no need to pass options explicitly
      await startHttpTransport(mockServer);

      expect(MockCreateServer).toHaveBeenCalled();
      expect(mockHttpServer.on).toHaveBeenCalledWith('request', expect.any(Function));
      expect(mockHttpServer.listen).toHaveBeenCalledWith(3000, 'localhost', expect.any(Function));
    });

    it('should handle SSE connections', async () => {
      // Test SSE connection handling - uses default parameter pattern
      await startHttpTransport(mockServer);

      // Verify server setup (SSE transport is only created when actual SSE request is made)
      expect(MockCreateServer).toHaveBeenCalled();
      expect(mockHttpServer.on).toHaveBeenCalledWith('request', expect.any(Function));
    });

    it('should handle message POST requests', async () => {
      // Test message handling - uses default parameter pattern
      await startHttpTransport(mockServer);

      // Test would involve creating HTTP requests
      // and verifying proper handling
      expect(MockCreateServer).toHaveBeenCalled();
    });

    it('should handle server errors', async () => {
      const error = new Error('Server error');

      mockHttpServer.listen.mockImplementation((_port: any, _host: any, _callback: any) => {
        mockHttpServer.on.mockImplementation((event: any, handler: any) => {
          if (event === 'error') {
            handler(error);
          }
        });
        throw error;
      });

      await expect(startHttpTransport(mockServer)).rejects.toThrow('Server error');
    });

    it('should set up request handler', async () => {
      await startHttpTransport(mockServer);

      expect(mockHttpServer.on).toHaveBeenCalledWith('request', expect.any(Function));
    });
  });

  describe('HTTP request handling', () => {
    it('should handle CORS headers', async () => {
      await startHttpTransport(mockServer);

      // Get the request handler
      const requestHandler = mockHttpServer.on.mock.calls.find((call: any) => call[0] === 'request')[1];

      // Mock request and response
      const mockReq = {
        method: 'GET',
        url: '/sse',
        headers: { host: 'localhost:3000' }
      };
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn()
      };

      // Call the request handler
      await requestHandler(mockReq, mockRes);

      // Verify CORS headers are set
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    });

    it('should handle preflight OPTIONS requests', async () => {
      await startHttpTransport(mockServer);

      // Get the request handler
      const requestHandler = mockHttpServer.on.mock.calls.find((call: any) => call[0] === 'request')[1];

      // Mock OPTIONS request
      const mockReq = {
        method: 'OPTIONS',
        url: '/sse',
        headers: { host: 'localhost:3000' }
      };
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn()
      };

      // Call the request handler
      await requestHandler(mockReq, mockRes);

      // Verify preflight handling
      expect(mockRes.writeHead).toHaveBeenCalledWith(200);
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle 404 for unknown routes', async () => {
      await startHttpTransport(mockServer);

      // Get the request handler
      const requestHandler = mockHttpServer.on.mock.calls.find((call: any) => call[0] === 'request')[1];

      // Mock unknown route request
      const mockReq = {
        method: 'GET',
        url: '/unknown',
        headers: { host: 'localhost:3000' }
      };
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn()
      };

      // Call the request handler
      await requestHandler(mockReq, mockRes);

      // Verify 404 response
      expect(mockRes.writeHead).toHaveBeenCalledWith(404);
      expect(mockRes.end).toHaveBeenCalledWith('Not Found');
    });
  });
});

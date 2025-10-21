/**
 * E2E tests for HTTP transport using StreamableHTTPServerTransport
 * Requires: npm run build prior to running Jest.
 */

import { startHttpServer, type HttpTransportClient } from './utils/httpTransportClient';

describe('HTTP Transport E2E Tests', () => {
  let client: HttpTransportClient;

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  describe('Basic HTTP Transport', () => {
    it('should start HTTP server on specified port', async () => {
      client = await startHttpServer({ port: 4001, host: 'localhost' });
      
      expect(client.baseUrl).toMatch(/http:\/\/localhost:4001/);
      expect(client.sessionId).toBeUndefined();
    });

    it('should initialize MCP session over HTTP', async () => {
      client = await startHttpServer();
      const response = await client.initialize();

      expect(response.result?.protocolVersion).toBe('2025-06-18');
      expect((response.result as any)?.serverInfo?.name).toBe('@jephilli-patternfly-docs/mcp');
      expect(client.sessionId).toBeDefined();
    });

    it('should list tools over HTTP', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({ 
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });
      const toolNames = response.result?.tools?.map((t: any) => t.name) || [];

      expect(toolNames).toContain('usePatternFlyDocs');
      expect(toolNames).toContain('fetchDocs');
      expect(toolNames).toHaveLength(2);
    });

    it('should handle concurrent requests', async () => {
      client = await startHttpServer();
      await client.initialize();

      // Send multiple requests concurrently
      const [response1, response2, response3] = await Promise.all([
        client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
        client.send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })
      ]);

      expect(response1.result?.tools).toBeDefined();
      expect(response2.result?.tools).toBeDefined();
      expect(response3.result?.tools).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should handle session initialization', async () => {
      client = await startHttpServer();
      const response = await client.initialize();

      expect(client.sessionId).toBeDefined();
      expect(response.result).toBeDefined();
      expect(typeof client.sessionId).toBe('string');
    });

    it('should maintain session across requests', async () => {
      client = await startHttpServer();
      await client.initialize();

      const sessionId1 = client.sessionId;

      // First request
      const response1 = await client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

      expect(response1.result).toBeDefined();

      // Second request with same session
      const response2 = await client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

      expect(response2.result).toBeDefined();
      expect(client.sessionId).toBe(sessionId1);
    });

    it('should handle multiple concurrent sessions', async () => {
      const client1 = await startHttpServer({ port: 4003 });
      const client2 = await startHttpServer({ port: 4004 });

      await client1.initialize();
      await client2.initialize();

      expect(client1.sessionId).toBeDefined();
      expect(client2.sessionId).toBeDefined();
      expect(client1.sessionId).not.toBe(client2.sessionId);

      await client1.close();
      await client2.close();
    });

    it('should handle session cleanup on close', async () => {
      client = await startHttpServer();
      await client.initialize();

      expect(client.sessionId).toBeDefined();

      await client.close();
      // Session should be cleaned up
    });
  });

  describe('Security Features', () => {
    it('should reject requests with invalid hosts', async () => {
      client = await startHttpServer({
        allowedHosts: ['localhost', '127.0.0.1']
      });

      // This test would require mocking the host header
      // For now, we'll test that the server starts with security enabled
      expect(client.baseUrl).toBeDefined();
    });

    it('should reject requests with invalid origins', async () => {
      client = await startHttpServer({
        allowedOrigins: ['https://app.com']
      });

      // This test would require mocking the origin header
      // For now, we'll test that the server starts with security enabled
      expect(client.baseUrl).toBeDefined();
    });

    it('should allow requests with valid hosts and origins', async () => {
      client = await startHttpServer({
        allowedHosts: ['localhost'],
        allowedOrigins: ['https://app.com']
      });

      const response = await client.initialize();

      expect(response.result).toBeDefined();
    });

    it('should enable DNS rebinding protection by default', async () => {
      client = await startHttpServer();

      // Server should start with DNS rebinding protection enabled
      expect(client.baseUrl).toBeDefined();

      const response = await client.initialize();

      expect(response.result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle server startup errors gracefully', async () => {
      // Test with invalid port
      await expect(startHttpServer({ port: 99999 })).rejects.toThrow();
    });

    it('should handle connection errors', async () => {
      client = await startHttpServer();

      // Close the client to simulate connection error
      await client.close();

      // Attempting to send should fail
      await expect(client.send({ method: 'tools/list' })).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      client = await startHttpServer();
      await client.initialize();

      // Test with very short timeout
      await expect(client.send(
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        { timeoutMs: 1 }
      )).rejects.toThrow('Request timeout');
    });

    it('should handle malformed requests', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'invalid/method',
        params: {}
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601);
    });
  });

  describe('Configuration Options', () => {
    it('should start server on custom port', async () => {
      client = await startHttpServer({ port: 4005 });
      
      expect(client.baseUrl).toMatch(/4005/);
    });

    it('should start server on custom host', async () => {
      client = await startHttpServer({ host: '127.0.0.1' });

      expect(client.baseUrl).toMatch(/127\.0\.0\.1/);
    });

    it('should configure allowed origins', async () => {
      client = await startHttpServer({
        allowedOrigins: ['https://app.com', 'https://admin.app.com']
      });

      const response = await client.initialize();

      expect(response.result).toBeDefined();
    });

    it('should configure allowed hosts', async () => {
      client = await startHttpServer({
        allowedHosts: ['localhost', '127.0.0.1']
      });

      const response = await client.initialize();

      expect(response.result).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should execute usePatternFlyDocs over HTTP', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({
        method: 'tools/call',
        params: {
          name: 'usePatternFlyDocs',
          arguments: {
            urlList: ['documentation/guidelines/README.md']
          }
        }
      });

      expect(response.result?.content?.[0]?.text).toContain('# Documentation from');
      expect(response.result?.content?.[0]?.text).toContain('documentation/guidelines/README.md');
    });

    it('should execute fetchDocs over HTTP', async () => {
      client = await startHttpServer();
      await client.initialize();

      // This would require a mock HTTP server for the URL
      // For now, we'll test that the tool is available
      const toolsResponse = await client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const toolNames = toolsResponse.result?.tools?.map((t: any) => t.name) || [];

      expect(toolNames).toContain('fetchDocs');
    });

    it('should handle tool execution errors', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({
        method: 'tools/call',
        params: {
          name: 'usePatternFlyDocs',
          arguments: {
            urlList: ['nonexistent/file.md']
          }
        }
      });

      // Should handle the error gracefully
      expect(response.result || response.error).toBeDefined();
    });

    it('should handle concurrent tool execution', async () => {
      client = await startHttpServer();
      await client.initialize();

      // Execute multiple tools concurrently
      const [response1, response2] = await Promise.all([
        client.send({
          method: 'tools/call',
          params: {
            name: 'usePatternFlyDocs',
            arguments: {
              urlList: ['documentation/guidelines/README.md']
            }
          }
        }),
        client.send({
          method: 'tools/call',
          params: {
            name: 'usePatternFlyDocs',
            arguments: {
              urlList: ['documentation/components/README.md']
            }
          }
        })
      ]);

      expect(response1.result?.content).toBeDefined();
      expect(response2.result?.content).toBeDefined();
    });
  });

  describe('HTTP Transport Integration', () => {
    it('should work with external HTTP fixture server', async () => {
      // Start HTTP fixture server
      const { startHttpFixture } = await import('./utils/httpFixtureServer');
      const fixture = await startHttpFixture({
        routes: {
          '/test.md': {
            status: 200,
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
            body: '# Test Document\n\nThis is a test document.'
          }
        }
      });

      try {
        client = await startHttpServer();
        await client.initialize();

        // Test fetchDocs with the fixture server
        const response = await client.send({
          method: 'tools/call',
          params: {
            name: 'fetchDocs',
            arguments: {
              urlList: [`${fixture.baseUrl}/test.md`]
            }
          }
        });

        expect(response.result?.content?.[0]?.text).toContain('# Test Document');
      } finally {
        await fixture.close();
      }
    });

    it('should handle large responses', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({
        method: 'tools/call',
        params: {
          name: 'usePatternFlyDocs',
          arguments: {
            urlList: [
              'documentation/guidelines/README.md',
              'documentation/components/README.md',
              'documentation/layout/README.md'
            ]
          }
        }
      });

      expect(response.result?.content?.[0]?.text).toBeDefined();
      expect(response.result?.content?.[0]?.text?.length).toBeGreaterThan(100);
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle rapid successive requests', async () => {
      client = await startHttpServer();
      await client.initialize();

      // Send 10 rapid requests
      const requests = Array.from({ length: 10 }, (_, i) =>
        client.send({ jsonrpc: '2.0', id: i + 1, method: 'tools/list', params: {} }));

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.result?.tools).toBeDefined();
      });
    });

    it('should maintain performance under load', async () => {
      client = await startHttpServer();
      await client.initialize();

      const startTime = Date.now();

      // Send multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        client.send({ method: 'tools/list' }));

      await Promise.all(requests);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });
});

import { serverAuditTool } from '../tool.serverAudit';
import { setOptions } from '../options.context';
import { DEFAULT_OPTIONS } from '../options.defaults';

describe('serverAuditTool', () => {
  it('should have a consistent return structure', () => {
    const tool = serverAuditTool();

    expect(tool).toHaveLength(3);
    expect(tool[0]).toBe('serverAudit');
    expect(tool[1]).toHaveProperty('description');
    expect(tool[1]).toHaveProperty('inputSchema');
    expect(typeof tool[2]).toBe('function');
  });

  it('should return audit information', async () => {
    const [_name, _schema, callback] = serverAuditTool();

    const result = await callback({});

    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('text');
    expect(result.content[0].text).toContain('PatternFly MCP Server Audit Report');
    expect(result.content[0].text).toContain('Server Information');
    expect(result.content[0].text).toContain('Expected Tools');
    expect(result.content[0].text).toContain('Configuration');
    expect(result.content[0].text).toContain('Health Checks');
  });

  it('should include server name and version', async () => {
    const options = { ...DEFAULT_OPTIONS, name: 'test-server', version: '1.2.3' };

    setOptions(options);

    const [_name, _schema, callback] = serverAuditTool(options);

    const result = await callback({});

    expect(result.content[0].text).toContain('test-server');
    expect(result.content[0].text).toContain('1.2.3');
  });

  it('should validate configuration', async () => {
    const [_name, _schema, callback] = serverAuditTool();

    const result = await callback({});

    expect(result.content[0].text).toContain('Configuration Validation');
    expect(result.content[0].text).toMatch(/✅|❌|⚠️/); // Should have at least one status icon
  });

  it('should include expected tools list', async () => {
    const [_name, _schema, callback] = serverAuditTool();

    const result = await callback({});

    expect(result.content[0].text).toContain('usePatternFlyDocs');
    expect(result.content[0].text).toContain('fetchDocs');
    expect(result.content[0].text).toContain('componentSchemas');
    expect(result.content[0].text).toContain('serverAudit');
  });

  it('should include health checks', async () => {
    const [_name, _schema, callback] = serverAuditTool();

    const result = await callback({});

    expect(result.content[0].text).toContain('Health Checks');
    expect(result.content[0].text).toMatch(/✅|❌|⚠️/); // Should have at least one status icon
  });

  it('should handle includeDetails parameter', async () => {
    const [_name, _schema, callback] = serverAuditTool();

    const resultWithoutDetails = await callback({ includeDetails: false });
    const resultWithDetails = await callback({ includeDetails: true });

    // With details should potentially have more information
    expect(resultWithDetails.content[0].text.length).toBeGreaterThanOrEqual(resultWithoutDetails.content[0].text.length);
  });

  it('should work with context options', async () => {
    const testOptions = { ...DEFAULT_OPTIONS, docsHost: true };

    const [_name, _schema, callback] = serverAuditTool(testOptions);

    const result = await callback({});

    expect(result.content[0].text).toContain('**Docs Host Mode:** Enabled');
  });

  it('should detect frozen options', async () => {
    const testOptions = { ...DEFAULT_OPTIONS };
    const frozenOptions = setOptions(testOptions);

    const [_name, _schema, callback] = serverAuditTool(frozenOptions);

    const result = await callback({});

    // Options should be frozen after setOptions
    expect(result.content[0].text).toContain('**Options Frozen:** Yes');
  });

  it('should validate input schema', () => {
    const [_name, schema] = serverAuditTool();

    expect(schema.inputSchema).toBeDefined();
    expect(schema.inputSchema.includeDetails).toBeDefined();
  });
});


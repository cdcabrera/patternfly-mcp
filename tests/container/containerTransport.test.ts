/**
 *  Requires: npm run test:container (builds the image before Jest).
 */
import {
  startServer,
  type StdioTransportClient
} from './utils/stdioTransportClient';

describe('Container, STDIO', () => {
  let CLIENT: StdioTransportClient;

  beforeAll(async () => {
    CLIENT = await startServer();
  });

  afterAll(async () => {
    if (CLIENT) {
      await CLIENT.close();
    }
  });

  it('should expose expected tools and stable shape', async () => {
    const response = await CLIENT.send({
      method: 'tools/list',
      params: {}
    });
    const tools = response?.result?.tools || [];
    const toolNames = tools.map((tool: any) => tool.name).sort();

    expect({ toolNames }).toMatchSnapshot();
  });

  it('should expose expected resources and templates', async () => {
    const resources = await CLIENT.send({ method: 'resources/list' });
    const updatedResources = resources?.result?.resources || [];
    const resourceNames = updatedResources.map((resource: any) => resource.uri).sort();

    const templates = await CLIENT.send({ method: 'resources/templates/list' });
    const updatedTemplates = templates?.result?.resourceTemplates || [];
    const templateNames = updatedTemplates.map((template: any) => template.uriTemplate).sort();

    expect(resourceNames).toContain('patternfly://context');
    expect(templateNames).toContain('patternfly://components/index');
    expect(templateNames).toContain('patternfly://components/meta');
    expect(templateNames).toContain('patternfly://components/index{?version,category}');
    expect(templateNames).toContain('patternfly://docs/index');
    expect(templateNames).toContain('patternfly://docs/meta');
    expect(templateNames).toContain('patternfly://docs/index{?version,category,section}');
    expect(templateNames).toContain('patternfly://docs/{name}{?version,category,section}');
    expect(templateNames).toContain('patternfly://schemas/index');
    expect(templateNames).toContain('patternfly://schemas/meta');
    expect(templateNames).toContain('patternfly://schemas/index{?version,category}');
    expect(templateNames).toContain('patternfly://schemas/{name}{?version,category}');
  });

  it('should read the patternfly-context resource', async () => {
    const response = await CLIENT.send({
      method: 'resources/read',
      params: { uri: 'patternfly://context' }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe('patternfly://context');
    expect(content.text).toContain('PatternFly MCP');
    expect(content).toMatchSnapshot();
  });
});

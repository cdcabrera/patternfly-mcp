import { resolveContainerEngine, startContainer, type StdioTransportClient } from './utils/containerClient';

const engine: any = resolveContainerEngine();

describeSkip(engine !== undefined)('Container Audit', () => {
  const image = 'localhost/patternfly-mcp:latest';
  let CLIENT: StdioTransportClient;

  beforeAll(async () => {
    CLIENT = await startContainer({
      engine,
      args: [
        'run',
        '--rm',
        '-i',
        '--security-opt=no-new-privileges',
        '--cap-drop=ALL',
        image,
        '--mode',
        'test'
      ]
    });
  });

  afterAll(async () => {
    if (CLIENT) {
      await CLIENT.stop();
    }
  });

  it('should start and have basic tools and resources', async () => {
    const tools = await CLIENT.send({ method: 'tools/list' });
    const hasTool = tools?.result?.tools?.some(
      (resource: any) => resource.uri === 'searchPatternFlyDocs' || resource.uri === 'searchPatternFly'
    );

    expect(hasTool).toBe(true);

    const resources = await CLIENT.send({ method: 'resources/list' });
    const hasResource = resources?.result?.resources?.some(
      (resource: any) => resource.uri === 'patternfly://context'
    );

    expect(hasResource).toBe(true);
  });
});

import { resolve } from 'node:path';
import {
  startServer,
  type StdioTransportClient
} from './utils/stdioTransportClient';
import { setupFetchMock } from './utils/fetchMock';

describe('Reproduction of URI issue for patternfly://components/', () => {
  let CLIENT: StdioTransportClient;

  beforeAll(async () => {
    setupFetchMock();
    CLIENT = await startServer({
      args: ['--experimental-context-management']
    });
  });

  afterAll(async () => {
    await CLIENT.stop();
  });

  it('should read a component resource and have a valid URI in contents', async () => {
    const uri = 'patternfly://components/button?id=19b2a9418c744e70da9e3dd0965d1948ec1ebbe4&version=v6&category=react';
    const response = await CLIENT.send({
      method: 'resources/read',
      params: { uri }
    });

    if (response?.error) {
      console.error('Response error:', JSON.stringify(response.error, null, 2));
    }

    const result = response?.result;
    expect(result).toBeDefined();
    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBeGreaterThan(0);

    const content = result.contents[0];
    console.log('Resource content[0]:', JSON.stringify(content, null, 2));

    expect(typeof content.uri).toBe('string');
    expect(content.uri).toMatch(/^patternfly:\/\/components\//);
  });
});

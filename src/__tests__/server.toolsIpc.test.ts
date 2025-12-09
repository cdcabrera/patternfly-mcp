import * as serverToolsIpc from '../server.toolsIpc';

describe('server.toolsIpc', () => {
  it('should return specific properties', () => {
    expect(serverToolsIpc).toMatchSnapshot();
  });
});

import * as serverToolsCreator from '../server.toolsCreator';

describe('server.toolsCreator', () => {
  it('should return specific properties', () => {
    expect(serverToolsCreator).toMatchSnapshot();
  });
});

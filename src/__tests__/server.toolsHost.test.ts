import * as serverToolsHost from '../server.toolsHost';

describe('server.toolsHost', () => {
  it('should return specific properties', () => {
    expect(serverToolsHost).toMatchSnapshot();
  });
});

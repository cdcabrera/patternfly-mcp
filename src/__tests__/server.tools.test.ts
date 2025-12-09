import * as serverTools from '../server.tools';

describe('server.tools', () => {
  it('should return specific properties', () => {
    expect(serverTools).toMatchSnapshot();
  });
});

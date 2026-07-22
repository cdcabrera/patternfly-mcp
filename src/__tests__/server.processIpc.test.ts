import { send, awaitIpc, isHelloAck } from '../server.processIpc';

describe('server.processIpc', () => {
  describe('send', () => {
    it('should return true when process.send is available', () => {
      const mockProcess = { send: jest.fn().mockReturnValue(true) } as any;
      const result = send(mockProcess, { t: 'test', id: '1' });

      expect(result).toBe(true);
      expect(mockProcess.send).toHaveBeenCalledWith({ t: 'test', id: '1' });
    });
  });

  describe('awaitIpc', () => {
    it('should resolve when matcher returns true', async () => {
      const mockProcess = {
        on: jest.fn(),
        off: jest.fn()
      } as any;

      const promise = awaitIpc(mockProcess, isHelloAck, 100);
      const onMessage = mockProcess.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];

      onMessage({ t: 'hello:ack', id: 'test-id' });

      const result = await promise;

      expect(result).toEqual({ t: 'hello:ack', id: 'test-id' });
    });
  });
});

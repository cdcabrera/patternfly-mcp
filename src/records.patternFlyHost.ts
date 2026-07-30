/**
 * PatternFly API Host — child process entry.
 * Handshake: hello -> load -> manifest:get -> invoke('crawl').
 * IPC schema shared with parent via records.patternFlyIpc.
 */
import { formatUnknownError } from './logger';
import { type IpcRequest, type IpcResponse } from './records.patternFlyIpc';

type Api = typeof import('./records.patternFlyApi');
let api: Api | undefined;

const send = (msg: IpcResponse) => {
  process.send?.(msg);
};

const onMessage = async (msg: IpcRequest) => {
  try {
    switch (msg.t) {
      case 'hello':
        send({ t: 'hello:ack', id: msg.id, pid: process.pid });

        return;

      case 'load': {
        try {
          api = await import('./records.patternFlyApi.js');
          send({ t: 'load:ack', id: msg.id, warnings: [], errors: [] });
        } catch (error) {
          send({ t: 'load:ack', id: msg.id, warnings: [], errors: [formatUnknownError(error)] });
        }

        return;
      }

      case 'manifest:get':
        send({
          t: 'manifest:result',
          id: msg.id,
          tools: [{ name: 'crawl', description: 'Run PatternFly API crawler' }]
        });

        return;

      case 'invoke': {
        if (msg.name !== 'crawl') {
          send({ t: 'invoke:result', id: msg.id, error: { code: 'UNKNOWN_TOOL', message: msg.name } });

          return;
        }
        if (!api) {
          send({ t: 'invoke:result', id: msg.id, error: { code: 'NOT_LOADED', message: 'load not called' } });

          return;
        }
        try {
          const result = await api.apiSpider();

          send({
            t: 'invoke:result',
            id: msg.id,
            result: { content: result },
            warnings: [],
            errors: []
          });
        } catch (error) {
          send({
            t: 'invoke:result',
            id: msg.id,
            error: { code: 'INVOKE_FAILED', message: formatUnknownError(error) }
          });
        }

        return;
      }

      case 'shutdown':
        process.exit(0);

        return;

      default:
        // ignore unknown
    }
  } catch (error) {
    process.stderr.write(`[patternFlyHost] fatal: ${formatUnknownError(error)}\n`);
  }
};

process.on('message', onMessage);
process.on('disconnect', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

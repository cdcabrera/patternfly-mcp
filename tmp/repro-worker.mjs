import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const workerScript = new URL('../dist/server.workerEntry.js', import.meta.url).pathname;
console.log('workerScript', workerScript);

const payload = {
  moduleSpecifier: '#collectionPatternFlyApi',
  exportName: 'runCollection',
  args: undefined,
  options: {},
  session: {}
};

const worker = new Worker(workerScript, { workerData: payload, stderr: false, stdout: false });

worker.on('message', m => console.log('MESSAGE', JSON.stringify(m).slice(0, 300)));
worker.on('error', e => console.log('ERROR', e));
worker.on('exit', code => console.log('EXIT', code));

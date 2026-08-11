import { Worker } from 'node:worker_threads';

const ctx = await import('../dist/options.context-DwcEZ1q8.js');
const getOptions = ctx.g;
const getSessionOptions = ctx.c;

const options = getOptions();
const session = getSessionOptions();

const workerScript = new URL('./repro-workerScript.mjs', import.meta.url).pathname;

const payload = {
  moduleSpecifier: '#collectionPatternFlyApi',
  exportName: 'runCollection',
  args: undefined,
  options,
  session
};

const worker = new Worker(workerScript, { workerData: payload });
worker.on('message', m => console.log('MSG', JSON.stringify(m).slice(0, 500)));
worker.on('error', e => console.log('ERROR', e));
worker.on('exit', code => {
  console.log('EXIT', code);
  process.exit(0);
});

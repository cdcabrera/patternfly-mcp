import { Worker } from 'node:worker_threads';

const ctx = await import('../dist/options.context-DwcEZ1q8.js');
const getOptions = ctx.g;
const getSessionOptions = ctx.c;

const options = getOptions();
const session = getSessionOptions();

console.log('options keys', Object.keys(options));
console.log('logging keys', Object.keys(options.logging || {}));
console.log('logging.logger type', typeof options.logging?.logger);
console.log('logging.stderr type', typeof options.logging?.stderr);
console.log('logging.protocol type', typeof options.logging?.protocol);
console.log('toolModules type', typeof options.toolModules, Array.isArray(options.toolModules) ? options.toolModules.length : '-');

const workerScript = new URL('../dist/server.workerEntry.js', import.meta.url).pathname;

const payload = {
  moduleSpecifier: '#collectionPatternFlyApi',
  exportName: 'runCollection',
  args: undefined,
  options,
  session
};

try {
  const worker = new Worker(workerScript, { workerData: payload });
  worker.on('message', m => console.log('MESSAGE', JSON.stringify(m).slice(0, 500)));
  worker.on('error', e => console.log('ERROR', e));
  worker.on('exit', code => {
    console.log('EXIT', code);
    process.exit(0);
  });
} catch (e) {
  console.log('SPAWN THREW', e);
}

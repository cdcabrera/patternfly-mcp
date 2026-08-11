import { Worker } from 'node:worker_threads';

const ctx = await import('../dist/options.context-DwcEZ1q8.js');
const getOptions = ctx.g;
const getSessionOptions = ctx.c;

const options = getOptions();
const session = getSessionOptions();

// Use inline module so we can add logging
const inline = `
import { parentPort, workerData } from 'node:worker_threads';
process.on('exit', code => {
  try { parentPort?.postMessage({ debug: 'exit', code }); } catch {}
});
process.on('uncaughtException', e => {
  try { parentPort?.postMessage({ debug: 'uncaught', err: String(e), stack: e?.stack }); } catch {}
});
process.on('unhandledRejection', e => {
  try { parentPort?.postMessage({ debug: 'unhandledRejection', err: String(e), stack: e?.stack }); } catch {}
});
parentPort?.postMessage({ debug: 'starting' });
try {
  const { r: runCollection } = await import(new URL('../dist/collection.patternFlyApi.js', import.meta.url).href);
  parentPort?.postMessage({ debug: 'imported', typeofRun: typeof runCollection });
  const { r: runWithOptions, l: runWithSession } = await import(new URL('../dist/options.context-DwcEZ1q8.js', import.meta.url).href);
  parentPort?.postMessage({ debug: 'ctx-imported', hasRunWithOptions: typeof runWithOptions, hasRunWithSession: typeof runWithSession });
  const result = await runWithOptions(workerData.options || {}, async () =>
    runWithSession(workerData.session || {}, async () => {
      parentPort?.postMessage({ debug: 'callback-invoking' });
      const r = await runCollection();
      parentPort?.postMessage({ debug: 'callback-done', records: r?.records?.length });
      return r;
    })
  );
  parentPort?.postMessage({ success: true, payload: result, debug: 'success' });
} catch (e) {
  parentPort?.postMessage({ success: false, error: String(e), stack: e?.stack, debug: 'caught' });
}
`;

const dataUrl = 'data:text/javascript;base64,' + Buffer.from(inline).toString('base64');

const payload = {
  moduleSpecifier: '#collectionPatternFlyApi',
  exportName: 'runCollection',
  args: undefined,
  options,
  session
};

const worker = new Worker(new URL(dataUrl), { workerData: payload });
worker.on('message', m => console.log('MSG', JSON.stringify(m).slice(0, 400)));
worker.on('error', e => console.log('ERROR', e));
worker.on('exit', code => {
  console.log('EXIT', code);
  process.exit(0);
});

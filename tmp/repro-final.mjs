// End-to-end repro that mirrors the transient worker call from `heavyPool`.
import { Worker } from 'node:worker_threads';
import { readdirSync } from 'node:fs';

// Find the options-context chunk (its hash may change on rebuild).
const distDir = new URL('../dist/', import.meta.url);
const ctxFile = readdirSync(distDir).find(f => /^options\.context-.*\.js$/.test(f));
if (!ctxFile) throw new Error('options.context chunk not found in dist/');

const ctx = await import(new URL(ctxFile, distDir).href);
const getOptions = ctx.g;
const getSessionOptions = ctx.c;

const options = getOptions();
const session = getSessionOptions();

const workerScript = new URL('../dist/server.workerEntry.js', import.meta.url).pathname;
const started = Date.now();

const payload = {
  moduleSpecifier: '#collectionPatternFlyApi',
  exportName: 'runCollection',
  args: undefined,
  options,
  session
};

const worker = new Worker(workerScript, { workerData: payload });
worker.on('message', m => {
  // Trim payloads to keep output compact.
  const summary = m.success === true
    ? { success: true, recordCount: m.payload?.records?.length }
    : m.success === false
      ? { success: false, error: m.error }
      : m;
  console.log('MSG', JSON.stringify(summary).slice(0, 400));
});
worker.on('error', e => console.log('ERROR', e));
worker.on('exit', code => {
  console.log('EXIT', code, `${Date.now() - started}ms`);
  process.exit(0);
});

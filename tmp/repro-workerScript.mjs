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
  const mod = await import('../dist/collection.patternFlyApi.js');
  const runCollection = mod.runCollection;
  parentPort?.postMessage({ debug: 'imported', typeofRun: typeof runCollection });

  const ctx = await import('../dist/options.context-DwcEZ1q8.js');
  // guess names using letters: try common names
  const runWithOptions = ctx.r;
  const runWithSession = ctx.l;
  parentPort?.postMessage({ debug: 'ctx-imported', ro: typeof runWithOptions, rs: typeof runWithSession });

  // Test apiSpider directly, NO keepalive.
  const apiSpider = mod.apiSpider;
  parentPort?.postMessage({ debug: 'spider-invoke' });
  const started = Date.now();

  // Inspect active handles right after firing spider
  const spiderPromise = apiSpider();
  parentPort?.postMessage({ debug: 'spider-fired' });
  await Promise.resolve();
  parentPort?.postMessage({ debug: 'handles-t0', reqs: process._getActiveRequests?.().length, handles: process._getActiveHandles?.().length });

  const result = await spiderPromise;
  parentPort?.postMessage({ debug: 'spider-done', ms: Date.now() - started, entries: result?.length });
  parentPort?.postMessage({ success: true, payload: result, debug: 'success' });
} catch (e) {
  parentPort?.postMessage({ success: false, error: String(e), stack: e?.stack, debug: 'caught' });
}

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

  // Test apiSpider directly.
  const apiSpider = mod.apiSpider;
  parentPort?.postMessage({ debug: 'spider-invoke', typeofApiSpider: typeof apiSpider });
  const started = Date.now();
  const spiderPromise = apiSpider();
  parentPort?.postMessage({ debug: 'spider-fired' });
  spiderPromise.then(entries => {
    parentPort?.postMessage({ debug: 'spider-done', ms: Date.now() - started, entries: entries?.length });
  }).catch(e => {
    parentPort?.postMessage({ debug: 'spider-err', err: String(e), stack: e?.stack });
  });

  // Keep alive with our own timer for 30s so we can observe
  const keepAlive = setInterval(() => {
    parentPort?.postMessage({ debug: 'tick', at: Date.now() - started });
  }, 2000);
  setTimeout(() => {
    clearInterval(keepAlive);
    parentPort?.postMessage({ debug: 'done-wait' });
  }, 30000);

  const result = { records: [] };
  parentPort?.postMessage({ success: true, payload: result, debug: 'success' });
} catch (e) {
  parentPort?.postMessage({ success: false, error: String(e), stack: e?.stack, debug: 'caught' });
}

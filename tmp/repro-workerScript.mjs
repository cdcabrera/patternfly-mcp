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

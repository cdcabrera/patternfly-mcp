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

  const apiSpider = mod.apiSpider;
  parentPort?.postMessage({ debug: 'spider-invoke' });
  const started = Date.now();
  const spiderPromise = apiSpider();

  // Poll handles/requests every 20ms via a REFED timer to keep loop alive AND observe
  const poll = setInterval(() => {
    const reqs = process._getActiveRequests?.() || [];
    const handles = process._getActiveHandles?.() || [];
    const handleTypes = handles.map(h => h?.constructor?.name || typeof h);
    const reqTypes = reqs.map(r => r?.constructor?.name || typeof r);
    parentPort?.postMessage({ debug: 'poll', at: Date.now() - started, reqs: reqs.length, handles: handles.length, handleTypes, reqTypes });
  }, 100);

  const result = await Promise.race([
    spiderPromise.then(v => ({ tag: 'done', v })),
    new Promise(r => setTimeout(() => r({ tag: 'timeout' }), 15000))
  ]);
  clearInterval(poll);
  parentPort?.postMessage({ debug: 'result', at: Date.now() - started, result: result.tag, entries: result?.v?.length });
  parentPort?.postMessage({ success: true, payload: result, debug: 'success' });
} catch (e) {
  parentPort?.postMessage({ success: false, error: String(e), stack: e?.stack, debug: 'caught' });
}

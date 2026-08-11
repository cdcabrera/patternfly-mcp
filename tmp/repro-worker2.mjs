import { Worker } from 'node:worker_threads';

const { getOptions, getSessionOptions } = await import('../dist/index.js').then(m => m).catch(() => import('../dist/options.context-DwcEZ1q8.js'));

// Use the internal module directly
const ctx = await import('../dist/options.context-DwcEZ1q8.js');
console.log('exported keys', Object.keys(ctx).slice(0, 30));
const gOpts = ctx.i || ctx.g || ctx.getOptions;
const gSes = ctx.h || ctx.getSessionOptions;
console.log('gOpts?', typeof gOpts, 'gSes?', typeof gSes);

// Grab it via named guessing - list all functions
for (const k of Object.keys(ctx)) {
  if (typeof ctx[k] === 'function') {
    try {
      const v = ctx[k]();
      console.log('name', k, 'result-keys', v && typeof v === 'object' ? Object.keys(v).slice(0, 6) : v);
    } catch (e) {
      // console.log('name', k, 'threw', e.message);
    }
  }
}

import { runWorker } from './server.workerRunner';

try {
  await runWorker();
} catch (error) {
  // Use console.error as a last resort since the logger might be broken or unsettled
  console.error('Fatal error in worker entry:', error);
  process.exit(1);
}

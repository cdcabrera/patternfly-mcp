import { createTransientPool, type WorkerPoolInstance } from '../server.workerPool';

describe('WorkerPool', () => {
  let pool: WorkerPoolInstance;

  const validCode = `
    export default function(args) {
      return args && args.test;
    }
  `;
  const validDataUri = `data:text/javascript;base64,${Buffer.from(validCode).toString('base64')}`;

  const invalidCode = `
    export default function() {
      throw new Error('Test execution error');
    }
  `;
  const invalidDataUri = `data:text/javascript;base64,${Buffer.from(invalidCode).toString('base64')}`;

  beforeEach(() => {
    pool = createTransientPool(2); // Throttled at 2 active threads
  });

  it('should successfully run a task in a worker thread and return the result', async () => {
    const result = await pool.runTask<any>({
      moduleSpecifier: validDataUri,
      args: { test: true }
    });

    expect(result).toBe(true);
  });

  it('should handle tasks in queue when active workers exceed limit', async () => {
    const promises = [
      pool.runTask({ moduleSpecifier: validDataUri, args: { test: true } }),
      pool.runTask({ moduleSpecifier: validDataUri, args: { test: true } }),
      pool.runTask({ moduleSpecifier: validDataUri, args: { test: true } })
    ];

    const results = await Promise.all(promises);

    expect(results).toEqual([true, true, true]);
  });

  it('should cleanly handle and bubble worker execution errors', async () => {
    await expect(
      pool.runTask({
        moduleSpecifier: invalidDataUri,
        args: {}
      })
    ).rejects.toThrow('Test execution error');
  });
});

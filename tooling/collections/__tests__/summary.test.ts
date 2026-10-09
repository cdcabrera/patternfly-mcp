import { jest } from '@jest/globals';
import { printDiffSummary } from '../summary';

describe('printDiffSummary', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should print no-change message when diff buckets are empty', () => {
    printDiffSummary(
      { added: [], removed: [], modified: [] },
      {
        title: 'Empty Diff',
        formatAdded: item => String(item),
        formatRemoved: item => String(item),
        formatModified: item => String(item)
      }
    );

    expect(logSpy).toHaveBeenCalledWith('\n📊 Empty Diff:');
    expect(logSpy).toHaveBeenCalledWith('   ✨ No record additions, removals, or property modifications detected.');
  });

  it('should print categorized changes with custom formatters', () => {
    printDiffSummary(
      {
        added: [{ name: 'A1' }],
        removed: [{ name: 'R1' }],
        modified: [{ name: 'M1', reason: 'score' }]
      },
      {
        title: 'Custom Changes',
        formatAdded: item => `Item: ${item.name}`,
        formatRemoved: item => `Item: ${item.name}`,
        formatModified: item => `Item: ${item.name} (${item.reason})`
      }
    );

    expect(logSpy).toHaveBeenCalledWith('\n📊 Custom Changes:');
    expect(logSpy).toHaveBeenCalledWith('   ➕ Added (1):');
    expect(logSpy).toHaveBeenCalledWith('      + Item: A1');
    expect(logSpy).toHaveBeenCalledWith('   ➖ Removed (1):');
    expect(logSpy).toHaveBeenCalledWith('      - Item: R1');
    expect(logSpy).toHaveBeenCalledWith('   🔄 Modified (1):');
    expect(logSpy).toHaveBeenCalledWith('      ~ Item: M1 (score)');
  });

  it('should truncate outputs exceeding default limits (10 added, 15 removed, 10 modified)', () => {
    const added = Array.from({ length: 12 }, (_, i) => `add-${i + 1}`);
    const removed = Array.from({ length: 18 }, (_, i) => `rem-${i + 1}`);
    const modified = Array.from({ length: 11 }, (_, i) => `mod-${i + 1}`);

    printDiffSummary(
      { added, removed, modified },
      {
        title: 'Truncated Diff',
        formatAdded: item => item,
        formatRemoved: item => item,
        formatModified: item => item
      }
    );

    expect(logSpy).toHaveBeenCalledWith('   ➕ Added (12):');
    expect(logSpy).toHaveBeenCalledWith('      + add-10');
    expect(logSpy).toHaveBeenCalledWith('      ... and 2 more');

    expect(logSpy).toHaveBeenCalledWith('   ➖ Removed (18):');
    expect(logSpy).toHaveBeenCalledWith('      - rem-15');
    expect(logSpy).toHaveBeenCalledWith('      ... and 3 more');

    expect(logSpy).toHaveBeenCalledWith('   🔄 Modified (11):');
    expect(logSpy).toHaveBeenCalledWith('      ~ mod-10');
    expect(logSpy).toHaveBeenCalledWith('      ... and 1 more');
  });

  it('should truncate outputs exceeding custom limits', () => {
    const added = ['a1', 'a2', 'a3'];
    const removed = ['r1', 'r2'];
    const modified = ['m1', 'm2', 'm3', 'm4'];

    printDiffSummary(
      { added, removed, modified },
      {
        title: 'Custom Limited Diff',
        formatAdded: item => item,
        formatRemoved: item => item,
        formatModified: item => item,
        limits: {
          added: 1,
          removed: 1,
          modified: 2
        }
      }
    );

    expect(logSpy).toHaveBeenCalledWith('   ➕ Added (3):');
    expect(logSpy).toHaveBeenCalledWith('      + a1');
    expect(logSpy).toHaveBeenCalledWith('      ... and 2 more');

    expect(logSpy).toHaveBeenCalledWith('   ➖ Removed (2):');
    expect(logSpy).toHaveBeenCalledWith('      - r1');
    expect(logSpy).toHaveBeenCalledWith('      ... and 1 more');

    expect(logSpy).toHaveBeenCalledWith('   🔄 Modified (4):');
    expect(logSpy).toHaveBeenCalledWith('      ~ m1');
    expect(logSpy).toHaveBeenCalledWith('      ~ m2');
    expect(logSpy).toHaveBeenCalledWith('      ... and 2 more');
  });
});

import {
  AVAILABLE_COLLECTIONS,
  badgeForResult,
  buildCollectionTree,
  cycleCollectionFilter,
  flattenTree,
  renderSearchScreen,
  runSearchScreen,
  type CollectionGroup,
  type SearchScreenState
} from '../client/client.screens';
import { type ResourceLinkItem } from '../client/client.transport';

describe('client.screens', () => {
  describe('badgeForResult', () => {
    it('returns [Collection] for collection items and [Record] for everything else', () => {
      expect(badgeForResult({ uri: 'patternfly://docs/modal', name: 'Modal (Collection)' })).toBe('[Collection]');
      expect(badgeForResult({ uri: 'patternfly://records/modal-doc', name: 'Modal — Docs (v6)' })).toBe('[Record]');
      expect(badgeForResult({ uri: 'patternfly://schemas/modal', name: 'Modal — JSON Schema (v6)' })).toBe('[Record]');
      expect(badgeForResult({ uri: 'patternfly://docs/other', name: 'Other Item' })).toBe('[Record]');
    });
  });

  describe('buildCollectionTree', () => {
    const sampleResults: ResourceLinkItem[] = [
      {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      },
      {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal',
        primaryCollection: 'patternfly-docs'
      },
      {
        uri: 'patternfly://records/modal-schema',
        name: 'Modal — JSON Schema (v6)',
        groupId: 'modal',
        primaryCollection: 'patternfly-component-schemas'
      },
      {
        uri: 'patternfly://docs/button',
        name: 'Button (Collection)',
        groupId: 'button'
      },
      {
        uri: 'patternfly://records/button-doc',
        name: 'Button — Docs (v6)',
        groupId: 'button',
        primaryCollection: 'patternfly-docs'
      }
    ];

    it('groups multi-collection results and calculates record counts without auto-expanding', () => {
      const groups = buildCollectionTree(sampleResults);

      expect(groups).toHaveLength(2);
      expect(groups[0]?.groupId).toBe('modal');
      expect(groups[0]?.name).toBe('Modal');
      expect(groups[0]?.records).toHaveLength(2);
      expect(groups[0]?.isExpanded).toBe(false);

      expect(groups[1]?.groupId).toBe('button');
      expect(groups[1]?.name).toBe('Button');
      expect(groups[1]?.records).toHaveLength(1);
      expect(groups[1]?.isExpanded).toBe(false);
    });

    it('auto-expands single collection matches when previousExpanded is empty', () => {
      const singleResults: ResourceLinkItem[] = [
        {
          uri: 'patternfly://docs/modal',
          name: 'Modal (Collection)',
          groupId: 'modal'
        },
        {
          uri: 'patternfly://records/modal-doc',
          name: 'Modal — Docs (v6)',
          groupId: 'modal'
        }
      ];

      const groups = buildCollectionTree(singleResults);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.groupId).toBe('modal');
      expect(groups[0]?.records).toHaveLength(1);
      expect(groups[0]?.isExpanded).toBe(true);
    });

    it('preserves previousExpanded state across rebuilds', () => {
      const previousExpanded = new Set(['button']);
      const groups = buildCollectionTree(sampleResults, previousExpanded);

      expect(groups.find(group => group.groupId === 'modal')?.isExpanded).toBe(false);
      expect(groups.find(group => group.groupId === 'button')?.isExpanded).toBe(true);
    });
  });

  describe('flattenTree', () => {
    it('flattens tree based on expanded states', () => {
      const groups: CollectionGroup[] = [
        {
          groupId: 'modal',
          name: 'Modal',
          records: [
            { uri: 'patternfly://records/modal-doc', name: 'Modal — Docs (v6)' }
          ],
          isExpanded: false
        },
        {
          groupId: 'button',
          name: 'Button',
          records: [
            { uri: 'patternfly://records/button-doc', name: 'Button — Docs (v6)' }
          ],
          isExpanded: true
        }
      ];

      const flat = flattenTree(groups);

      expect(flat).toHaveLength(3);
      expect(flat[0]).toEqual({ kind: 'collection', group: groups[0] });
      expect(flat[1]).toEqual({ kind: 'collection', group: groups[1] });
      expect(flat[2]).toEqual({
        kind: 'record',
        item: groups[1]!.records[0],
        parentGroup: groups[1]
      });
    });
  });

  describe('cycleCollectionFilter', () => {
    it('cycles from undefined through all available collections and back to undefined', () => {
      expect(AVAILABLE_COLLECTIONS).toEqual([
        'patternfly-docs',
        'patternfly-component-schemas',
        'patternfly-api'
      ]);

      let current: string | undefined = undefined;

      current = cycleCollectionFilter(current);
      expect(current).toBe('patternfly-docs');

      current = cycleCollectionFilter(current);
      expect(current).toBe('patternfly-component-schemas');

      current = cycleCollectionFilter(current);
      expect(current).toBe('patternfly-api');

      current = cycleCollectionFilter(current);
      expect(current).toBeUndefined();
    });
  });

  describe('renderSearchScreen', () => {
    let outputData = '';
    const originalWrite = process.stdout.write;

    beforeEach(() => {
      outputData = '';
      process.stdout.write = ((chunk: string) => {
        outputData += chunk;

        return true;
      }) as never;
    });

    afterEach(() => {
      process.stdout.write = originalWrite;
    });

    it('renders header, collection groups, records, and formatted key hints', () => {
      const groups = buildCollectionTree([
        { uri: 'patternfly://docs/modal', name: 'Modal (Collection)', groupId: 'modal' },
        { uri: 'patternfly://records/modal-doc', name: 'Modal — Docs (v6)', groupId: 'modal' }
      ]);
      const flatVisibleTree = flattenTree(groups);

      const state: SearchScreenState = {
        query: 'modal',
        activeCollectionFilter: 'patternfly-docs',
        results: [],
        collectionGroups: groups,
        flatVisibleTree,
        selectedIndex: 0
      };

      renderSearchScreen(state);

      expect(outputData).toContain('Filter: <patternfly-docs>  (1 collections, 1 records)');
      expect(outputData).toContain('[Collection] Modal [1 records]');
      expect(outputData).toContain('[Record] Modal — Docs (v6)');
      expect(outputData).toContain('[<↑/↓> navigate · <Enter> select · <Space> toggle · <Tab> filter · </> search · <q> quit]');
    });

    it('renders <All Collections> when activeCollectionFilter is undefined', () => {
      const state: SearchScreenState = {
        query: 'test',
        activeCollectionFilter: undefined,
        results: [],
        collectionGroups: [],
        flatVisibleTree: [],
        selectedIndex: 0
      };

      renderSearchScreen(state);

      expect(outputData).toContain('Filter: <All Collections>  (0 collections, 0 records)');
      expect(outputData).toContain('No matches yet. Press </> to change query or <q> to quit.');
    });
  });

  describe('runSearchScreen', () => {
    const mockSession = {
      search: jest.fn(),
      readResource: jest.fn(),
      connect: jest.fn(),
      close: jest.fn()
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('handles toggle navigation with space and enter on collection nodes and opens record', async () => {
      const modalCollection: ResourceLinkItem = {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      };
      const modalRecord: ResourceLinkItem = {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal'
      };

      const groups = buildCollectionTree([modalCollection, modalRecord]);

      // starts expanded because 1 group
      groups[0]!.isExpanded = true;
      const flat = flattenTree(groups);

      const state: SearchScreenState = {
        query: 'modal',
        results: [modalCollection, modalRecord],
        collectionGroups: groups,
        flatVisibleTree: flat,
        selectedIndex: 0
      };

      const keyQueue = ['space', 'down', 'enter'];
      const mockKeys = {
        readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
        enable: jest.fn(),
        disable: jest.fn(),
        dispose: jest.fn()
      };

      // 1. 'space' collapses modal collection
      // 2. 'down' keeps selectedIndex on only visible row (0)
      // 3. 'enter' expands modal collection
      // 4. 'q' quits
      const result = await runSearchScreen(mockSession as never, state, mockKeys as never);

      expect(result).toEqual({ action: 'quit' });
    });

    it('opens reader on enter when child record is selected', async () => {
      const modalCollection: ResourceLinkItem = {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      };
      const modalRecord: ResourceLinkItem = {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal'
      };

      const groups = buildCollectionTree([modalCollection, modalRecord]);

      groups[0]!.isExpanded = true;
      const flat = flattenTree(groups);

      const state: SearchScreenState = {
        query: 'modal',
        results: [modalCollection, modalRecord],
        collectionGroups: groups,
        flatVisibleTree: flat,
        selectedIndex: 1 // On record node
      };

      const keyQueue = ['enter'];
      const mockKeys = {
        readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
        enable: jest.fn(),
        disable: jest.fn(),
        dispose: jest.fn()
      };

      const result = await runSearchScreen(mockSession as never, state, mockKeys as never);

      expect(result).toEqual({
        action: 'open',
        uri: 'patternfly://records/modal-doc',
        state: expect.objectContaining({ selectedIndex: 1 })
      });
    });

    it('cycles collection filter on tab and re-queries session.search', async () => {
      mockSession.search.mockResolvedValue([
        {
          uri: 'patternfly://records/modal-api',
          name: 'Modal — API',
          groupId: 'modal',
          primaryCollection: 'patternfly-docs'
        }
      ]);

      const state: SearchScreenState = {
        query: 'modal',
        activeCollectionFilter: undefined,
        results: [],
        collectionGroups: [],
        flatVisibleTree: [],
        selectedIndex: 0
      };

      const keyQueue = ['tab', 'q'];
      const mockKeys = {
        readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
        enable: jest.fn(),
        disable: jest.fn(),
        dispose: jest.fn()
      };

      await runSearchScreen(mockSession as never, state, mockKeys as never);

      expect(mockSession.search).toHaveBeenCalledWith('modal', 'patternfly-docs');
    });
  });
});

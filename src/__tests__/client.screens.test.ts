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

    it('purges empty collections that have zero child records', () => {
      const resultsWithEmpty: ResourceLinkItem[] = [
        {
          uri: 'patternfly://docs/user-feedback',
          name: 'User Feedback (Collection)',
          groupId: 'user-feedback'
        },
        {
          uri: 'patternfly://records/modal-doc',
          name: 'Modal — Docs (v6)',
          groupId: 'modal'
        }
      ];

      const groups = buildCollectionTree(resultsWithEmpty);

      expect(groups.find(group => group.groupId === 'user-feedback')).toBeUndefined();
      expect(groups).toHaveLength(1);
      expect(groups[0]?.records).toHaveLength(1);
    });

    it('sanitizes raw hex hashes from group titles', () => {
      const hashResult: ResourceLinkItem = {
        uri: 'patternfly://records/btn-acc',
        name: 'Button - Accessibility (v6)',
        groupId: '39f74ce79e010122147ee142402d9caf4e99382b'
      };

      const groups = buildCollectionTree([hashResult]);

      expect(groups[0]?.name).toBe('Button');
      expect(/^[a-f0-9]{32,40}$/i.test(groups[0]!.name)).toBe(false);
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
    it('flattens multi-record collections and renders single-record matches as top-level records', () => {
      const groups: CollectionGroup[] = [
        {
          groupId: 'modal',
          name: 'Modal',
          records: [
            { uri: 'patternfly://records/modal-doc-1', name: 'Modal — Docs (v6)' },
            { uri: 'patternfly://records/modal-doc-2', name: 'Modal — Examples (v6)' }
          ],
          isExpanded: false
        },
        {
          groupId: 'button',
          name: 'Button',
          records: [
            { uri: 'patternfly://records/button-doc-1', name: 'Button — Docs (v6)' },
            { uri: 'patternfly://records/button-doc-2', name: 'Button — Examples (v6)' }
          ],
          isExpanded: true
        },
        {
          groupId: 'wizard-submit',
          name: 'Wizard',
          records: [
            { uri: 'patternfly://records/wizard-step', name: 'Wizard - Step Actions (v6)' }
          ],
          isExpanded: false
        }
      ];

      const flat = flattenTree(groups);

      // Expect:
      // [0]: Collection 'modal' (collapsed)
      // [1]: Collection 'button' (expanded)
      // [2]: Record 'Button — Docs' (child of button)
      // [3]: Record 'Button — Examples' (child of button)
      // [4]: Record 'Wizard - Step Actions' (standalone top-level record, no collection wrapper)
      expect(flat).toHaveLength(5);
      expect(flat[0]).toEqual({ kind: 'collection', group: groups[0] });
      expect(flat[1]).toEqual({ kind: 'collection', group: groups[1] });
      expect(flat[2]).toEqual({
        kind: 'record',
        item: groups[1]!.records[0],
        parentGroup: groups[1]
      });
      expect(flat[3]).toEqual({
        kind: 'record',
        item: groups[1]!.records[1],
        parentGroup: groups[1]
      });
      expect(flat[4]).toEqual({
        kind: 'record',
        item: groups[2]!.records[0]
      });
    });
  });

  describe('cycleCollectionFilter', () => {
    it('cycles from undefined through all available collections and back to undefined', () => {
      expect(AVAILABLE_COLLECTIONS).toEqual([
        'patternfly-docs',
        'patternfly-component-schemas',
        'patternfly-api',
        'ai-handbook'
      ]);

      let current: string | undefined = undefined;

      current = cycleCollectionFilter(current);
      expect(current).toBe('patternfly-docs');

      current = cycleCollectionFilter(current);
      expect(current).toBe('patternfly-component-schemas');

      current = cycleCollectionFilter(current);
      expect(current).toBe('patternfly-api');

      current = cycleCollectionFilter(current);
      expect(current).toBe('ai-handbook');

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

      // Modal has 1 record -> rendered as top-level record, collection count is 0
      expect(outputData).toContain('Filter: <patternfly-docs>  (0 collections, 1 records)');
      expect(outputData).toContain('[Record] Modal — Docs (v6)');
      expect(outputData).toContain('[<↑/↓> navigate · <Enter> select · <Tab> filter · </> search · <q> quit]');
    });

    it('renders <Closest match> when activeCollectionFilter is undefined', () => {
      const state: SearchScreenState = {
        query: 'test',
        activeCollectionFilter: undefined,
        results: [],
        collectionGroups: [],
        flatVisibleTree: [],
        selectedIndex: 0
      };

      renderSearchScreen(state);

      expect(outputData).toContain('Filter: <Closest match>  (0 collections, 0 records)');
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

    it('handles toggle navigation with enter on collection nodes and opens record', async () => {
      const modalCollection: ResourceLinkItem = {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      };
      const modalRecord1: ResourceLinkItem = {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal'
      };
      const modalRecord2: ResourceLinkItem = {
        uri: 'patternfly://records/modal-schema',
        name: 'Modal — JSON Schema (v6)',
        groupId: 'modal'
      };

      const groups = buildCollectionTree([modalCollection, modalRecord1, modalRecord2]);

      // starts expanded because 1 group
      groups[0]!.isExpanded = true;
      const flat = flattenTree(groups);

      const state: SearchScreenState = {
        query: 'modal',
        results: [modalCollection, modalRecord1, modalRecord2],
        collectionGroups: groups,
        flatVisibleTree: flat,
        selectedIndex: 0
      };

      const keyQueue = ['enter', 'down', 'enter'];
      const mockKeys = {
        readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
        enable: jest.fn(),
        disable: jest.fn(),
        dispose: jest.fn()
      };

      // 1. 'enter' collapses modal collection
      // 2. 'down' keeps selectedIndex on only visible row (0)
      // 3. 'enter' expands modal collection again
      // 4. 'q' quits
      const result = await runSearchScreen(mockSession as never, state, mockKeys as never);

      expect(result).toEqual({ action: 'quit' });
    });

    it('enforces accordion behavior by closing other collections when expanding a collection', async () => {
      const modalCol: ResourceLinkItem = {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      };
      const modalRec1: ResourceLinkItem = {
        uri: 'patternfly://records/modal-1',
        name: 'Modal - Doc 1 (v6)',
        groupId: 'modal'
      };
      const modalRec2: ResourceLinkItem = {
        uri: 'patternfly://records/modal-2',
        name: 'Modal - Doc 2 (v6)',
        groupId: 'modal'
      };
      const btnCol: ResourceLinkItem = {
        uri: 'patternfly://docs/button',
        name: 'Button (Collection)',
        groupId: 'button'
      };
      const btnRec1: ResourceLinkItem = {
        uri: 'patternfly://records/btn-1',
        name: 'Button - Doc 1 (v6)',
        groupId: 'button'
      };
      const btnRec2: ResourceLinkItem = {
        uri: 'patternfly://records/btn-2',
        name: 'Button - Doc 2 (v6)',
        groupId: 'button'
      };

      const groups = buildCollectionTree([modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2]);

      groups[0]!.isExpanded = true;
      groups[1]!.isExpanded = false;

      const state: SearchScreenState = {
        query: 'test',
        results: [modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2],
        collectionGroups: groups,
        flatVisibleTree: flattenTree(groups),
        selectedIndex: 3 // Cursor on Button collection header
      };

      // Press 'enter' on Button collection: expands Button, collapses Modal
      const keyQueue = ['enter'];
      const mockKeys = {
        readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
        enable: jest.fn(),
        disable: jest.fn(),
        dispose: jest.fn()
      };

      const result = await runSearchScreen(mockSession as never, state, mockKeys as never);

      expect(result).toEqual({ action: 'quit' });

      // Modal should now be collapsed, Button should be expanded
      const modalGroup = state.collectionGroups.find(group => group.groupId === 'modal');
      const btnGroup = state.collectionGroups.find(group => group.groupId === 'button');

      expect(modalGroup?.isExpanded).toBe(false);
      expect(btnGroup?.isExpanded).toBe(true);

      // Cursor should remain on the Button collection header
      const currentItem = state.flatVisibleTree[state.selectedIndex];

      expect(currentItem?.kind).toBe('collection');
      if (currentItem?.kind === 'collection') {
        expect(currentItem.group.groupId).toBe('button');
      }
    });

    it('enforces accordion behavior when expanding a collection using right arrow', async () => {
      const modalCol: ResourceLinkItem = {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      };
      const modalRec1: ResourceLinkItem = {
        uri: 'patternfly://records/modal-1',
        name: 'Modal - Doc 1 (v6)',
        groupId: 'modal'
      };
      const modalRec2: ResourceLinkItem = {
        uri: 'patternfly://records/modal-2',
        name: 'Modal - Doc 2 (v6)',
        groupId: 'modal'
      };
      const btnCol: ResourceLinkItem = {
        uri: 'patternfly://docs/button',
        name: 'Button (Collection)',
        groupId: 'button'
      };
      const btnRec1: ResourceLinkItem = {
        uri: 'patternfly://records/btn-1',
        name: 'Button - Doc 1 (v6)',
        groupId: 'button'
      };
      const btnRec2: ResourceLinkItem = {
        uri: 'patternfly://records/btn-2',
        name: 'Button - Doc 2 (v6)',
        groupId: 'button'
      };

      const groups = buildCollectionTree([modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2]);

      groups[0]!.isExpanded = true;
      groups[1]!.isExpanded = false;

      const state: SearchScreenState = {
        query: 'test',
        results: [modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2],
        collectionGroups: groups,
        flatVisibleTree: flattenTree(groups),
        selectedIndex: 3 // Cursor on Button collection header
      };

      // Press 'right' on Button collection: expands Button, collapses Modal
      const keyQueue = ['right'];
      const mockKeys = {
        readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
        enable: jest.fn(),
        disable: jest.fn(),
        dispose: jest.fn()
      };

      const result = await runSearchScreen(mockSession as never, state, mockKeys as never);

      expect(result).toEqual({ action: 'quit' });

      const modalGroup = state.collectionGroups.find(group => group.groupId === 'modal');
      const btnGroup = state.collectionGroups.find(group => group.groupId === 'button');

      expect(modalGroup?.isExpanded).toBe(false);
      expect(btnGroup?.isExpanded).toBe(true);

      const currentItem = state.flatVisibleTree[state.selectedIndex];

      expect(currentItem?.kind).toBe('collection');
      if (currentItem?.kind === 'collection') {
        expect(currentItem.group.groupId).toBe('button');
      }
    });

    it('opens reader on enter when child record is selected', async () => {
      const modalCollection: ResourceLinkItem = {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      };
      const modalRecord1: ResourceLinkItem = {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal'
      };
      const modalRecord2: ResourceLinkItem = {
        uri: 'patternfly://records/modal-schema',
        name: 'Modal — JSON Schema (v6)',
        groupId: 'modal'
      };

      const groups = buildCollectionTree([modalCollection, modalRecord1, modalRecord2]);

      groups[0]!.isExpanded = true;
      const flat = flattenTree(groups);

      const state: SearchScreenState = {
        query: 'modal',
        results: [modalCollection, modalRecord1, modalRecord2],
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

    it('opens reader on enter when standalone top-level record is selected', async () => {
      const standaloneRecord: ResourceLinkItem = {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal'
      };

      const groups = buildCollectionTree([standaloneRecord]);
      const flat = flattenTree(groups);

      const state: SearchScreenState = {
        query: 'modal',
        results: [standaloneRecord],
        collectionGroups: groups,
        flatVisibleTree: flat,
        selectedIndex: 0
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
        state: expect.objectContaining({ selectedIndex: 0 })
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

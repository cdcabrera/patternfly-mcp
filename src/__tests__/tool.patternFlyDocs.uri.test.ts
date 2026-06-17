import { usePatternFlyDocsTool } from '../tool.patternFlyDocs';
import { searchPatternFlyDocsTool } from '../tool.searchPatternFlyDocs';
import { DEFAULT_OPTIONS } from '../options.defaults';
import { getPatternFlyMcpResources, getPatternFlyComponentSchema } from '../patternFly.getResources';
import { searchPatternFly } from '../patternFly.search';
import { processDocsFunction } from '../server.getResources';

jest.mock('../patternFly.getResources');
jest.mock('../patternFly.search');
jest.mock('../server.getResources');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => {
    // eslint-disable-next-line no-param-reassign
    fn.memo = fn;

    return fn;
  })
}));

const mockGetResources = getPatternFlyMcpResources as jest.MockedFunction<typeof getPatternFlyMcpResources>;
const mockSearch = searchPatternFly as unknown as { memo: jest.Mock };
const mockSchema = getPatternFlyComponentSchema as unknown as { memo: jest.Mock };
const mockProcessDocs = processDocsFunction as unknown as { memo: jest.Mock };

describe('URI Blocking Investigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetResources.mockResolvedValue({
      latestVersion: 'v6',
      availableVersions: ['v6'],
      keywordsIndex: [],
      byPath: {},
      byGroupId: {}
    } as any);
  });

  it('searchPatternFlyDocs returns URIs', async () => {
    mockSearch.memo.mockResolvedValue({
      isSearchWildCardAll: false,
      exactMatches: [{
        name: 'ToolbarFilter',
        uri: 'patternfly://docs/ToolbarFilter',
        uriSchemas: 'patternfly://schemas/ToolbarFilter',
        entries: [{ displayName: 'Toolbar Filter', version: 'v6', description: 'desc', path: '' }]
      }],
      searchResults: [{
        item: 'ToolbarFilter',
        distance: 0,
        matches: [],
        score: 0
      }],
      remainingMatches: [{
        name: 'ToolbarFilter',
        uri: 'patternfly://docs/ToolbarFilter',
        uriSchemas: 'patternfly://schemas/ToolbarFilter',
        entries: [{ displayName: 'Toolbar Filter', version: 'v6', description: 'desc', path: '' }]
      }],
      totalPotentialMatches: 1
    });

    const [_name, _schema, callback] = searchPatternFlyDocsTool(DEFAULT_OPTIONS);
    const result = await callback({ searchQuery: 'ToolbarFilter' }) as any;

    expect(result.content[0].text).toContain('patternfly://docs/ToolbarFilter');
    expect(result.content[0].text).toContain('patternfly://schemas/ToolbarFilter');
  });

  it('usePatternFlyDocs resolves patternfly:// URIs in name', async () => {
    mockSearch.memo.mockResolvedValue({
      exactMatches: [{
        name: 'ToolbarFilter',
        isSchemasAvailable: true,
        entries: [{ name: 'ToolbarFilter', version: 'v6', path: '' }]
      }],
      searchResults: []
    } as any);

    mockSchema.memo.mockResolvedValue({
      name: 'ToolbarFilter',
      schema: { type: 'object' }
    });

    mockProcessDocs.memo.mockResolvedValue([]);

    const [_name, _schema, callback] = usePatternFlyDocsTool(DEFAULT_OPTIONS);

    const result = await callback({ name: 'patternfly://docs/ToolbarFilter' }) as any;

    expect(result.content[0].text).toContain('Component Schema for ToolbarFilter');
  });

  it('usePatternFlyDocs resolves patternfly:// URIs in urlList', async () => {
    mockSearch.memo.mockResolvedValue({
      exactMatches: [{
        name: 'ToolbarFilter',
        isSchemasAvailable: true,
        entries: [{ name: 'ToolbarFilter', version: 'v6', path: '' }]
      }],
      searchResults: []
    } as any);

    mockSchema.memo.mockResolvedValue({
      name: 'ToolbarFilter',
      schema: { type: 'object' }
    });

    mockProcessDocs.memo.mockResolvedValue([]);

    const [_name, _schema, callback] = usePatternFlyDocsTool(DEFAULT_OPTIONS);

    const result = await callback({ urlList: ['patternfly://docs/ToolbarFilter'] }) as any;

    expect(result.content[0].text).toContain('Component Schema for ToolbarFilter');
  });
});

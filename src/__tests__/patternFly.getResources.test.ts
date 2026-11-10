import {
  setCategoryDisplayLabel,
  getPatternFlyComponentSchema,
  getPatternFlyComponentNames,
  mutateKeyWordsMap,
  getPatternFlyMcpResources,
  getPatternFlyCollection,
  setPatternFlyCollection
} from '../patternFly.getResources';

jest.mock('@patternfly/patternfly-component-schemas/json', () => ({
  getComponentSchema: jest.fn().mockResolvedValue({
    name: 'Button',
    props: {
      children: {
        type: 'node',
        required: false,
        description: 'Content rendered inside the button.'
      }
    }
  }),
  componentNames: ['Button']
}));

describe('setCategoryDisplayLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    await setPatternFlyCollection('patternfly-docs', {
      config: { title: 'PatternFly Docs' },
      response: {
        records: [
          {
            id: 'docs::button',
            sourceId: 'button',
            sourceType: 'local',
            data: {
              button: [
                {
                  displayName: 'Button',
                  description: 'Button description',
                  pathSlug: 'button',
                  section: 'components',
                  category: 'react',
                  path: 'https://www.patternfly.org/v6/components/button',
                  version: 'v6'
                }
              ]
            }
          }
        ]
      }
    });

    await setPatternFlyCollection('patternfly-component-schemas', {
      config: { title: 'Component Schemas' },
      response: {
        records: [
          {
            id: 'schema::button',
            sourceId: 'button',
            sourceType: 'package',
            data: {
              button: [
                {
                  displayName: 'Button',
                  description: 'PatternFly React component: Button',
                  pathSlug: 'schemas-button',
                  category: 'react',
                  section: 'components',
                  source: 'schemas',
                  version: 'v6',
                  isSchemasAvailable: true
                }
              ]
            }
          }
        ]
      }
    });
  });

  afterAll(() => {
    setPatternFlyCollection.clear();
  });

  it.each([
    {
      description: 'empty string',
      entry: ''
    },
    {
      description: 'undefined',
      entry: undefined
    },
    {
      description: 'null',
      entry: null
    },
    {
      description: 'design',
      entry: {
        displayName: 'Lorem Ipsum',
        section: 'components',
        category: 'design-guidelines',
        path: 'https://www.patternfly.org/v6/components/lorem-ipsum/design-guidelines'
      }
    },
    {
      description: 'accessibility',
      entry: {
        displayName: 'Dolor Sit',
        section: 'components',
        category: 'accessibility',
        path: 'https://www.patternfly.org/v6/components/dolor-sit/accessibility'
      }
    },
    {
      description: 'example',
      entry: {
        displayName: 'Lorem Sit',
        section: 'components',
        category: 'react',
        path: 'https://www.patternfly.org/v6/components/lorem-sit/components'
      }
    },
    {
      description: 'guidelines',
      entry:
        {
          displayName: 'Sit Sit',
          section: 'guidelines',
          category: 'react',
          path: 'documentation:components/sit-sit/guidelines.md'
        }
    }
  ])('should normalize categories and apply linking markdown, $description', ({ entry }) => {
    expect(setCategoryDisplayLabel(entry as any)).toMatchSnapshot();
  });
});

describe('getPatternFlyComponentSchema', () => {
  beforeAll(async () => {
    await setPatternFlyCollection('patternfly-component-schemas', {
      config: { title: 'Component Schemas' },
      response: {
        records: [
          {
            id: 'schema::button',
            sourceId: 'button',
            sourceType: 'package',
            data: {
              button: [
                {
                  displayName: 'Button',
                  description: 'PatternFly React component: Button',
                  pathSlug: 'schemas-button',
                  category: 'react',
                  section: 'components',
                  source: 'schemas',
                  version: 'v6',
                  isSchemasAvailable: true
                }
              ]
            }
          }
        ]
      }
    });
  });

  afterAll(() => {
    setPatternFlyCollection.clear();
  });

  it.each([
    {
      description: 'default',
      componentName: 'Button',
      expected: true
    },
    {
      description: 'unknown component',
      componentName: 'Lorem',
      expected: false
    }
  ])('should attempt to return a schema', async ({ componentName, expected }) => {
    const output = await getPatternFlyComponentSchema(componentName);

    expect(Boolean(output)).toBe(expected);
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyComponentSchema).toHaveProperty('memo');
  });
});

describe('getPatternFlyComponentNames', () => {
  it('should return multiple organized facets', async () => {
    const result = await getPatternFlyComponentNames();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyComponentNames).toHaveProperty('memo');
  });
});

describe('mutateKeyWordsMap', () => {
  it.each([
    {
      description: 'blocklist is prioritized over exception for split tokens',
      params: {
        keyword: 'component cli tooling',
        name: 'resource',
        version: 'v1'
      },
      settings: {
        blockList: ['component'],
        exceptionList: ['component', 'cli']
      }
    },
    {
      description: 'exception keeps length token when not blocked',
      params: {
        keyword: 'cli guidelines',
        name: 'resource',
        version: 'v1'
      },
      settings: undefined
    },
    {
      description: 'word length filter combined with blocklist',
      params: {
        keyword: 'cli or guidelines',
        name: 'resource',
        version: 'v1'
      },
      settings: {
        blockList: ['cli', 'guidelines'],
        lengthFilter: 2
      }
    }
  ])('should handle filtering keywords map, $description', ({ params, settings }) => {
    const keywordsMap = new Map();

    mutateKeyWordsMap(keywordsMap, params, settings);

    expect(Object.keys(Object.fromEntries(keywordsMap))).toMatchSnapshot();
  });
});

describe('getPatternFlyMcpResources', () => {
  beforeAll(async () => {
    await setPatternFlyCollection('patternfly-docs', {
      config: { title: 'PatternFly Docs' },
      response: {
        records: [
          {
            id: 'docs::button',
            sourceId: 'button',
            sourceType: 'local',
            data: {
              button: [
                {
                  displayName: 'Button',
                  description: 'Button description',
                  pathSlug: 'button',
                  section: 'components',
                  category: 'react',
                  path: 'https://www.patternfly.org/v6/components/button',
                  version: 'v6'
                }
              ]
            }
          }
        ]
      }
    });

    await setPatternFlyCollection('patternfly-component-schemas', {
      config: { title: 'Component Schemas' },
      response: {
        records: [
          {
            id: 'schema::button',
            sourceId: 'button',
            sourceType: 'package',
            data: {
              button: [
                {
                  displayName: 'Button',
                  description: 'PatternFly React component: Button',
                  pathSlug: 'schemas-button',
                  category: 'react',
                  section: 'components',
                  source: 'schemas',
                  version: 'v6',
                  isSchemasAvailable: true
                }
              ]
            }
          }
        ]
      }
    });
  });

  afterAll(() => {
    setPatternFlyCollection.clear();
  });

  it('should return multiple organized facets', async () => {
    const result = await getPatternFlyMcpResources();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', async () => {
    expect(getPatternFlyMcpResources).toHaveProperty('memo');
  });

  it('should have lowercased index keys', async () => {
    const result = await getPatternFlyMcpResources();

    expect(Array.from(result.pathIndex.keys()).some(key => /[A-Z]/.test(key))).toBe(false);
    expect(Array.from(result.uriIndex.keys()).some(key => /[A-Z]/.test(key))).toBe(false);
    expect(Array.from(result.hashIndex.keys()).some(key => /[A-Z]/.test(key))).toBe(false);
  });

  it('should index uriGroupId, unparameterized doc URIs, and schema URIs in uriIndex', async () => {
    const result = await getPatternFlyMcpResources();
    const buttonResource = result.resources.get('button');

    expect(buttonResource).toBeDefined();
    expect(buttonResource?.groupId).toBeDefined();

    // Confirm uriIndex contains groupId and keys
    const groupId = buttonResource?.groupId || '';

    expect(result.uriIndex.get(`patternfly://docs/${groupId}`.toLowerCase())).toBe('button');
    expect(result.uriIndex.get(`patternfly://schemas/${groupId}`.toLowerCase())).toBe('button');
    expect(result.uriIndex.get('patternfly://docs/button')).toBe('button');
    expect(result.uriIndex.get('patternfly://schemas/button')).toBe('button');

    // Confirm hashIndex maps groupId
    expect(result.hashIndex.get(groupId.toLowerCase())).toBe('button');

    // Confirm entries have uriGroupId
    const entries = buttonResource?.entries || [];

    expect(entries.every(entry => (entry as any).uriGroupId.includes(groupId))).toBe(true);
  });

  it('should generate unique hash IDs for pathless component entries', async () => {
    const result = await getPatternFlyMcpResources();
    const entries = Array.from(result.resources.values()).flatMap(resource => resource.entries);

    const ids = entries.map(entry => entry.id);
    const pathlessEntries = entries.filter(entry => !entry.path);

    // Confirm that IDs generally exist.
    expect(ids.length).toBeGreaterThan(0);

    const pathlessEntryIds = new Set(pathlessEntries.map(entry => entry.id));

    // Confirm that all pathless entries have unique IDs.
    expect(pathlessEntryIds.size).toBe(pathlessEntries.length);
  });
});

describe('getPatternFlyMcpResources ai-helpers collection', () => {
  const PINNED_SHA = '1426ddfb9a37a9b3411dd661d9c5de1127e0e655';

  beforeAll(async () => {
    await setPatternFlyCollection('patternfly-docs', {
      config: { title: 'PatternFly Docs' },
      response: { records: [] }
    });

    await setPatternFlyCollection('ai-helpers', {
      config: { title: 'AI Helpers' },
      response: {
        records: [
          {
            id: 'docs::ai-helpers::skills',
            sourceId: 'skills',
            sourceType: 'local',
            data: {
              skills: [
                {
                  displayName: 'PF Chart Gen',
                  description: 'PatternFly skill: pf-chart-gen.',
                  pathSlug: 'ai-helpers-skill-pf-chart-gen',
                  section: 'skills',
                  category: 'reference',
                  source: 'rh-uxd/ai-helpers',
                  path: `https://raw.githubusercontent.com/rh-uxd/ai-helpers/${PINNED_SHA}/plugins/patternfly/pf-react/skills/pf-chart-gen/SKILL.md`,
                  version: 'main',
                  collection: 'ai-helpers'
                }
              ]
            }
          }
        ]
      }
    });
  });

  afterAll(() => {
    setPatternFlyCollection.clear();
  });

  it('should register ai-helpers and index collection-filtered resources', async () => {
    const registered = getPatternFlyCollection('ai-helpers');

    expect(registered?.name).toBe('ai-helpers');
    expect(registered?.config).toMatchObject({ title: 'AI Helpers' });

    const result = await getPatternFlyMcpResources();

    expect(result.collections).toContain('ai-helpers');

    const helpersEntries = result.byCollection['ai-helpers'] ?? [];

    expect(helpersEntries).toHaveLength(1);
    expect(helpersEntries[0]?.collection).toBe('ai-helpers');
    expect(helpersEntries[0]?.displayCollection).toBe('AI Helpers');
    expect(helpersEntries[0]?.pathSlug).toBe('ai-helpers-skill-pf-chart-gen');

    const skillsResource = result.resources.get('skills');

    expect(skillsResource?.entries).toHaveLength(1);
    expect(skillsResource?.entries[0]?.uri).toMatch(/^patternfly:\/\/docs\/skills/);
  });
});

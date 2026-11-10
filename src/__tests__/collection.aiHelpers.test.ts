import { aiHelpersCollection, collectionCallback } from '../collection.aiHelpers';
import { type PatternFlyMcpDocsCatalogDoc } from '../docs.embedded';
import { isPlainObject } from '../server.helpers';

const PINNED_SHA = '1426ddfb9a37a9b3411dd661d9c5de1127e0e655';

type AiHelpersCatalogDoc = PatternFlyMcpDocsCatalogDoc & { collection?: string };

const getGroupEntries = (data: unknown, key: string): AiHelpersCatalogDoc[] => {
  if (!isPlainObject(data)) {
    return [];
  }

  const entries = data[key];

  return Array.isArray(entries) ? entries as AiHelpersCatalogDoc[] : [];
};
const PF_CHART_GEN_PATH = `https://raw.githubusercontent.com/rh-uxd/ai-helpers/${PINNED_SHA}/plugins/patternfly/pf-react/skills/pf-chart-gen/SKILL.md`;

describe('aiHelpersCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the correct collection name and configuration', () => {
    const [name, config, callback, _config] = aiHelpersCollection();

    expect(name).toBe('ai-helpers');
    expect(config).toEqual({
      title: 'AI Helpers'
    });
    expect(typeof callback).toBe('function');
    expect(_config).toBeDefined();
    expect(_config?.isRequired).toBe(true);
    expect(_config?.retainLastViable).toBe(true);
    expect(_config?.initial).toBeUndefined();
  });
});

describe('collectionCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load documentation records and match McpCollectionResult structure', async () => {
    const result = await collectionCallback();

    expect(result).toHaveProperty('records');
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records).toHaveLength(2);
  });

  it('should expose overview and skills groups with 78 seeded entries', async () => {
    const result = await collectionCallback();
    const recordIds = result.records.map(record => record.id).sort();

    expect(recordIds).toEqual(['docs::ai-helpers::overview', 'docs::ai-helpers::skills']);

    const entryCount = result.records.reduce((total, record) => {
      if (!isPlainObject(record.data)) {
        return total;
      }

      const groupEntries = Object.values(record.data)[0];

      return total + (Array.isArray(groupEntries) ? groupEntries.length : 0);
    }, 0);

    expect(entryCount).toBe(78);
  });

  it('should preserve a representative SHA-pinned skill path and inject collection metadata', async () => {
    const result = await collectionCallback();
    const skillsRecord = result.records.find(record => record.id === 'docs::ai-helpers::skills');
    const skills = getGroupEntries(skillsRecord?.data, 'skills');
    const chartGen = skills.find(entry => entry.pathSlug === 'ai-helpers-skill-pf-chart-gen');

    expect(chartGen).toBeDefined();
    expect(chartGen?.path).toBe(PF_CHART_GEN_PATH);
    expect(chartGen?.collection).toBe('ai-helpers');
    expect(skills.every(entry => entry.collection === 'ai-helpers')).toBe(true);

    const overviewRecord = result.records.find(record => record.id === 'docs::ai-helpers::overview');
    const overviews = getGroupEntries(overviewRecord?.data, 'overview');

    expect(overviews).toHaveLength(6);
    expect(overviews.every(entry => entry.collection === 'ai-helpers')).toBe(true);
  });

  it('should match snapshot for collection result', async () => {
    const result = await collectionCallback();

    const snapshotSubset = {
      recordSummaries: result.records.map(record => {
        const data = isPlainObject(record.data) ? record.data : {};
        const firstGroup = Object.values(data)[0];
        const entries = Array.isArray(firstGroup) ? firstGroup : [];

        return {
          id: record.id,
          sourceId: record.sourceId,
          sourceType: record.sourceType,
          entryCount: entries.length,
          firstEntry: entries[0]
        };
      })
    };

    expect(snapshotSubset).toMatchSnapshot();
  });
});

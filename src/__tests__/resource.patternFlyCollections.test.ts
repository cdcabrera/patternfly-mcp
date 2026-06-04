import {
  patternFlyCollectionsResource,
  listResources,
  resourceCallback
} from '../resource.patternFlyCollections';
import { getOptions, runWithOptions } from '../options.context';
import { isPlainObject } from '../server.helpers';

describe('patternFlyCollectionsResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlyCollectionsResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

/*
describe('listResources', () => {
  it('should return a list of resources', async () => {
    const resources = await listResources();

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/components\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
  });
});
 */

/*
describe('patternFlyCollectionsResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only register if contextManagement is true', () => {
    const resource = patternFlyCollectionsResource();
    const meta = resource[5] as any;

    expect(meta.shouldRegister?.(getOptions())).toBe(false);

    const options = { ...getOptions(), contextManagement: true };

    expect(meta.shouldRegister?.(options)).toBe(true);
  });
});

describe('resourceCallback', () => {
  const options = { ...getOptions(), contextManagement: true };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return collection hub content for a valid group ID', async () => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { collectionsIndex } = await getPatternFlyContextManagementResources.memo();

    if (collectionsIndex.length === 0) {
      return;
    }

    const record = collectionsIndex[0];

    if (!record) {
      return;
    }

    const result = await runWithOptions(options, async () =>
      resourceCallback(new URL(`patternfly://collections/${record.id}`), { id: record.id }));

    expect(result.contents).toBeDefined();
    expect(result.contents[0]?.text).toContain(`# ${record.displayName}`);
    expect(result.contents[0]?.text).toContain('pfmcp_collection:');
  });

  it('should throw error for non-group ID', async () => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { versionIndex } = await getPatternFlyContextManagementResources.memo();
    const terminalRecord = versionIndex.find(record => !record.isCollection);

    if (!terminalRecord) {
      return;
    }

    await expect(runWithOptions(options, async () =>
      resourceCallback(new URL(terminalRecord.uri as string), { id: terminalRecord.id }))).rejects.toThrow('Collection hub not found');
  });
});

 */

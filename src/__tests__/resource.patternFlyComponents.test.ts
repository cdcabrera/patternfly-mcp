import { patternFlyComponentsResource, resourceCallback } from '../resource.patternFlyComponents';
import { getOptions, runWithOptions } from '../options.context';

describe('patternFlyComponentsResource', () => {
  it('should only register if contextManagement is true', () => {
    const resource = patternFlyComponentsResource();
    const meta = resource[5] as any;

    expect(meta.shouldRegister?.(getOptions())).toBe(false);

    const options = { ...getOptions(), contextManagement: true };

    expect(meta.shouldRegister?.(options)).toBe(true);
  });
});

describe('resourceCallback', () => {
  const options = { ...getOptions(), contextManagement: true };

  it.each([
    {
      description: 'technical specs',
      contains: [
        ' (Technical overview)',
        '### Documentation & guidelines'
      ]
    }
  ])('should return a response for a valid component, $description', async ({ contains }) => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { versionIndex } = await getPatternFlyContextManagementResources.memo();
    const record = versionIndex.find(record => !record.isCollection && record.isSchemasAvailable);
    // const record = versionIndex.find(record => !record.isCollection && !record.isSchemasAvailable);

    const result = await runWithOptions(options, async () =>
      resourceCallback(new URL(`patternfly://components/${record?.id}`), { id: record?.id as any }));

    [record?.name, ...contains].forEach(item => expect(result.contents[0]?.text).toContain(item));

    // expect(result.contents[0]?.text).toContain(`Technical specifications and JSON schemas are not available for **${record.name}**`);
    // expect(result.contents[0]?.text).toContain(`patternfly://docs/${record.id}`);
  });

  it('should provide suggestion when collection ID is used', async () => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { collectionsIndex } = await getPatternFlyContextManagementResources.memo();
    const record = collectionsIndex[0];

    await expect(runWithOptions(options, async () =>
      resourceCallback(new URL(`patternfly://components/${record?.id}`), { id: record?.id as any })))
      .rejects.toThrow(`is a collection hub, not a specific component technical overview. Try accessing it via patternfly://collections/${record?.id}`);
  });
});

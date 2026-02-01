import { normalizePatternFlyDocsIndex, patternFlyDocsIndexResource } from '../resource.patternFlyDocsIndex';
import { isPlainObject } from '../server.helpers';

describe('normalizePatternFlyDocsIndex', () => {
  it.each([
    {
      description: 'empty',
      categories: {}
    },
    {
      description: 'basic categories',
      categories: {
        'design-guidelines': [
          {
            displayName: 'Lorem Ipsum',
            section: 'components',
            category: 'design-guidelines',
            path: 'https://www.patternfly.org/v6/components/lorem-ipsum/design-guidelines'
          }
        ],
        accessibility: [
          {
            displayName: 'Dolor Sit',
            section: 'components',
            category: 'accessibility',
            path: 'https://www.patternfly.org/v6/components/dolor-sit/accessibility'
          }
        ],
        react: [
          {
            displayName: 'Lorem Sit',
            section: 'components',
            category: 'react',
            path: 'https://www.patternfly.org/v6/components/lorem-sit/components'
          },
          {
            displayName: 'Sit Sit',
            section: 'guidelines',
            category: 'react',
            path: 'documentation:components/sit-sit/guidelines.md'
          }
        ]
      }
    }
  ])('should normalize categories and apply linking markdown, $description', ({ categories }) => {
    expect(normalizePatternFlyDocsIndex(categories as any)).toMatchSnapshot('normalized categories');
  });
});

describe('patternFlyDocsIndexResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlyDocsIndexResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('patternFlyDocsIndexResource, callback', () => {
  it.each([
    {
      description: 'default',
      args: []
    }
  ])('should return context content, $description', async ({ args }) => {
    const [_name, _uri, _config, callback] = (patternFlyDocsIndexResource as any)();
    const result = await (callback as any)(...args);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0])).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0].text).toContain('[@patternfly/About Modal - Accessibility]');
  });
});

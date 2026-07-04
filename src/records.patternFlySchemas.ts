import {
  componentNames as pfComponentNames
  // getComponentSchema
} from '@patternfly/patternfly-component-schemas/json';
import { type CollectionSource, type CollectionRecord } from './records';
import { getPatternFlyVersionContext } from './patternFly.helpers';

/**
 * Component schemas collection from @patternfly/patternfly-component-schemas.
 */
const patternFlySchemasCollection = (): CollectionSource => {
  const callback = async () => {
    const { latestSchemasVersion } = await getPatternFlyVersionContext.memo();
    // const records: CollectionRecord[] = [];
    const recordsMap: Map<string, CollectionRecord> = new Map();

    pfComponentNames.forEach(name => {
      const normalizedName = name.toLowerCase();
      const id = `schema::${normalizedName}`;

      if (recordsMap.has(id)) {
        return;
      }

      const record = {
        id,
        sourceId: normalizedName,
        sourceType: 'package' as const,
        data: {
          [normalizedName]: [
            {
              displayName: name,
              description: `PatternFly React component: ${name}`,
              pathSlug: `schemas-${normalizedName}`,
              category: 'react',
              section: 'components',
              version: latestSchemasVersion,
              // TODO: This may need a rethink the original/current schema represents a MB of data for all entries at min
              isSchemasAvailable: true
            }
          ]
        }
      };

      recordsMap.set(record.id, record);
    });

    /*
    for (const name of pfComponentNames) {
      // const schema = await getComponentSchema(name);
      const id = `schema::${name}`;

      if (recordsMap.has(id)) {
        continue;
      }

      const record = {
        id,
        sourceId: name,
        sourceType: 'package' as const,
        data: {
          name,
          category: 'react',
          section: 'components',
          description: `PatternFly React component: ${name}`,
          version: latestSchemasVersion,
          // TODO: This may need a rethink the original/current schema represents a MB of data for all entries at min
          isSchemasAvailable: true
        }
      };

      recordsMap.set(record.id, record);
    }
     */

    if (!recordsMap.has('schema::table')) {
      recordsMap.set('schema::table', {
        id: 'schema::table',
        sourceId: 'table',
        sourceType: 'package' as const,
        data: {
          table: [{
            displayName: 'Table',
            description: 'PatternFly React component: table',
            pathSlug: 'schemas-table',
            category: 'react',
            section: 'components',
            version: latestSchemasVersion,
            // schema: null
            isSchemasAvailable: false
          }]
        }
      });
    }

    return { records: [...recordsMap.values()] };
  };

  return [
    'patternfly-component-schemas',
    callback,
    {
      isRequired: true
    }
  ];
};

export {
  patternFlySchemasCollection
};

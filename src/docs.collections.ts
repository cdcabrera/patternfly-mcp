/**
 * Root collection definition for dynamic generation.
 *
 * @note Section or Category matches are used for dynamic collections' generation.
 */
interface Collection {
  name: string;
  displayName: string;
  description: string;
  matches: {
    sections?: string[];
    categories?: string[];
  };
}

/**
 * Core collections for PatternFly documentation.
 */
const COLLECTIONS: Collection[] = [
  {
    name: 'Components',
    displayName: 'Components Collection',
    description: 'Technical specifications and documentation for all PatternFly components.',
    matches: {
      sections: ['components']
    }
  },
  {
    name: 'Charts',
    displayName: 'Charts Collection',
    description: 'Data visualization components, charts, and related guidelines.',
    matches: {
      sections: ['charts'],
      categories: ['charts']
    }
  },
  {
    name: 'Layouts',
    displayName: 'Layouts Collection',
    description: 'Structural layout components and structural guidelines.',
    matches: {
      sections: ['layouts'],
      categories: ['layouts']
    }
  },
  {
    name: 'Forms',
    displayName: 'Forms Collection',
    description: 'Form controls, inputs, and related form documentation.',
    matches: {
      categories: ['forms']
    }
  }
];

export { COLLECTIONS, type Collection };

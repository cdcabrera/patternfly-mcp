/**
 * Root collection definition for dynamic generation.
 */
interface RootCollectionDefinition {
  name: string;
  displayName: string;
  description: string;
  /**
   * Section or Category to match against for dynamic generation.
   * If a record matches any of these, it will be added to the collection.
   */
  matches: {
    sections?: string[];
    categories?: string[];
  };
}

/**
 * Root collections for PatternFly documentation.
 */
const ROOT_COLLECTIONS: RootCollectionDefinition[] = [
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

export { ROOT_COLLECTIONS, type RootCollectionDefinition };

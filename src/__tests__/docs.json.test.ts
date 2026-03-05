import docs from '../docs.json';

describe('docs.json', () => {
  it('should have metadata reflective of its JSON content', () => {
    expect(docs.meta.totalEntries).toBeDefined();
    expect(Object.entries(docs.docs).length).toBe(docs.meta.totalEntries);

    expect(docs.meta.totalDocs).toBeDefined();

    let totalDocs = 0;

    Object.values(docs.docs).forEach(entries => {
      if (Array.isArray(entries)) {
        totalDocs += entries.length;
      }
    });

    expect(totalDocs).toBe(docs.meta.totalDocs);
  });

  it('should have unique links per each entry', () => {
    const allLinks = new Set<string>();
    const baseLinks = new Set<string | undefined>();
    const flatDocs = Object.values(docs.docs).flat();

    flatDocs.forEach(entry => {
      allLinks.add(entry.path);

      if (entry.path.includes('documentation:')) {
        baseLinks.add('documentation:');
      } else if (entry.path.includes('/patternfly/patternfly-org/')) {
        baseLinks.add(entry.path.split('/patternfly/patternfly-org/')[1]?.split('/')[0]);
      } else if (entry.path.includes('/patternfly/patternfly-react/')) {
        baseLinks.add(entry.path.split('/patternfly/patternfly-react/')[1]?.split('/')[0]);
      }
    });

    expect(Array.from(baseLinks)).toMatchSnapshot('limited version hashes');
    expect(allLinks.size).toBe(flatDocs.length);
    expect(allLinks.size).toBe(docs.meta.totalDocs);
  });
});

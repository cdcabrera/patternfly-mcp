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
    const flatDocs = Object.values(docs.docs).flat();

    flatDocs.forEach(entry => allLinks.add(entry.path));

    expect(allLinks.size).toBe(flatDocs.length);
    expect(allLinks.size).toBe(docs.meta.totalDocs);
  });
});

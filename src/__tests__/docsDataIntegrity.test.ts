import { distance } from 'fastest-levenshtein';
import docsJson from '../docs.json';

describe('Documentation Data Integrity', () => {
  const allEntries = Object.values(docsJson.docs).flat();
  const uniqueCategories = [...new Set(allEntries.map(entry => entry.category).filter(Boolean))];
  const uniqueSections = [...new Set(allEntries.map(entry => (entry as any).section).filter(Boolean))];

  const checkSimilarity = (list: string[], type: string) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const str1 = list[i]!.toLowerCase();
        const str2 = list[j]!.toLowerCase();

        // Check for near-duplicates using Levenshtein distance
        const dist = distance(str1, str2);

        if (dist <= 2) {
          throw new Error(`Potential duplicate ${type} found: "${list[i]}" and "${list[j]}" (distance: ${dist})`);
        }

        // Check if one is a substring of another (e.g., "component" and "components")
        if (str1.includes(str2) || str2.includes(str1)) {
          throw new Error(`Potential overlapping ${type} found: "${list[i]}" and "${list[j]}"`);
        }
      }
    }
  };

  test('categories should be unique and distinct', () => {
    expect(() => checkSimilarity(uniqueCategories as string[], 'category')).not.toThrow();
  });

  test('sections should be unique and distinct', () => {
    expect(() => checkSimilarity(uniqueSections as string[], 'section')).not.toThrow();
  });

  test('no section should be named "getting-started"', () => {
    const hasGettingStarted = allEntries.some(entry => (entry as any).section === 'getting-started');

    expect(hasGettingStarted).toBe(false);
  });
});

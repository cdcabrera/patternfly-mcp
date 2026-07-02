import { crawl } from '../records.spider';
import { makeAstroCrawlStep, ASTRO_API_BASE } from '../records.astro';

describe('records.astro', () => {
  it('should parse Astro versions and enqueue them', async () => {
    const fetchRaw = jest.fn().mockImplementation(async url => {
      if (url === `${ASTRO_API_BASE}/versions`) {
        return { status: 200, body: JSON.stringify(['v1', 'v2']) };
      }

      return { status: 200, body: '[]' };
    });

    const step = makeAstroCrawlStep();

    await crawl([`${ASTRO_API_BASE}/versions`], step, { fetchRaw });

    expect(fetchRaw).toHaveBeenCalledWith(`${ASTRO_API_BASE}/versions`, expect.anything());
    expect(fetchRaw).toHaveBeenCalledWith(`${ASTRO_API_BASE}/v1`, expect.anything());
    expect(fetchRaw).toHaveBeenCalledWith(`${ASTRO_API_BASE}/v2`, expect.anything());
  });

  it('should parse sections and items and extract semantic context', async () => {
    const fetchRaw = jest.fn().mockImplementation(async url => {
      if (url === `${ASTRO_API_BASE}/v1`) {
        return { status: 200, body: JSON.stringify(['components']) };
      }

      if (url === `${ASTRO_API_BASE}/v1/components`) {
        return { status: 200, body: JSON.stringify(['button']) };
      }

      if (url === `${ASTRO_API_BASE}/v1/components/button`) {
        return { status: 200, body: JSON.stringify(['react', 'html']) };
      }

      return { status: 200, body: 'leaf content' };
    });

    const step = makeAstroCrawlStep();
    const results = await crawl([`${ASTRO_API_BASE}/v1`], step, { fetchRaw });

    // Expecting to crawl:
    // Depth 1: v1
    // Depth 2: v1/components
    // Depth 3: v1/components/button -> enqueues react, html, props, css
    // Depth 4: v1/components/button/react, v1/components/button/html, v1/components/button/props, v1/components/button/css

    const urls = results.map(result => result.url);

    expect(urls).toContain(`${ASTRO_API_BASE}/v1/components/button/react`);
    expect(urls).toContain(`${ASTRO_API_BASE}/v1/components/button/html`);
    expect(urls).toContain(`${ASTRO_API_BASE}/v1/components/button/props`);
    expect(urls).toContain(`${ASTRO_API_BASE}/v1/components/button/css`);

    const reactResult = results.find(result => result.url.endsWith('react'));

    expect(reactResult?.semanticContext).toEqual({
      version: 'v1',
      section: 'components',
      item: 'button',
      facet: 'react'
    });

    const propsResult = results.find(result => result.url.endsWith('props'));

    expect(propsResult?.semanticContext).toEqual({
      version: 'v1',
      section: 'components',
      item: 'button',
      facet: 'props'
    });
  });
});

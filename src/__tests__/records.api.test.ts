import { apiSpider } from '../records.api';

describe('apiSpider', () => {
  it('should process the api', async () => {
    const output = await apiSpider();

    console.log(output);

    expect(output).toBeDefined();
  }, 30_000);
});

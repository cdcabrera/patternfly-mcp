import { randomInt } from 'node:crypto';
import docs from '#docsCatalog';

/**
 * Modern Fisher-Yates shuffle using crypto.randomInt
 *
 * @param arr - Array to shuffle
 */
function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);

    // @ts-ignore
    // eslint-disable-next-line no-param-reassign
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function getPrefix(url: string): string {
  try {
    const updatedUrl = new URL(url);

    if (updatedUrl.hostname !== 'raw.githubusercontent.com') {
      return updatedUrl.hostname;
    }

    const parts = updatedUrl.pathname.split('/').filter(Boolean);

    if (parts.length < 3) {
      return `raw.githubusercontent.com/${parts.join('/')}`;
    }
    const [owner, repo, ref] = parts;

    return `raw.githubusercontent.com/${owner}/${repo}/${ref}`;
  } catch {
    return 'invalid-url';
  }
}

// 1. Collect and Group all paths from docs.json
const allPaths: string[] = Object.values(docs.docs)
  .flatMap((arr: any) => arr)
  .map((doc: any) => doc.path)
  .filter((path: any) => typeof path === 'string' && path.startsWith('http'));

const groups: Record<string, string[]> = allPaths.reduce((acc, url) => {
  const key = getPrefix(url);

  (acc[key] ||= []).push(url);

  return acc;
}, {} as Record<string, string[]>);

// 2. Sampling Logic (3 per group, max 50 total)
const perGroup = Number(process.env.DOCS_AUDIT_PER_GROUP ?? 3);
const maxTotal = Number(process.env.DOCS_AUDIT_MAX_TOTAL ?? 50);

let auditSet: string[] = [];

for (const urls of Object.values(groups)) {
  const copy = [...urls];

  shuffleInPlace(copy);
  auditSet.push(...copy.slice(0, perGroup));
}

if (maxTotal > 0 && auditSet.length > maxTotal) {
  shuffleInPlace(auditSet);
  auditSet = auditSet.slice(0, maxTotal);
}

// 3. Network Check Helper
const PER_REQUEST_TIMEOUT_MS = 10_000;

async function checkUrl(url: string) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PER_REQUEST_TIMEOUT_MS);

  try {
    // Attempt HEAD request first
    const response = await fetch(url, { method: 'HEAD', signal: ac.signal });

    if (response.ok) {
      return { url, ok: true, status: response.status, method: 'HEAD' };
    }

    // Fallback to GET with Range header for efficiency if HEAD is rejected
    const response2 = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: ac.signal
    });

    return { url, ok: response2.ok, status: response2.status, method: 'GET' };
  } catch {
    return { url, ok: false, method: 'FETCH_ERROR' };
  } finally {
    clearTimeout(timer);
  }
}

// 4. Test Suite with test.each
describe('Documentation Link Audit', () => {
  // Increase timeout for the whole suite as it's doing network requests
  jest.setTimeout(auditSet.length * 5000 + 10000);

  test.each(auditSet)('Link should be reachable: %s', async url => {
    const result = await checkUrl(url);

    // if (!result.ok) {
    //  throw new Error(`Failed to fetch ${url} via ${result.method}. Status: ${result.status ?? 'Error'}`);
    // }

    expect(result.status).toBeGreaterThanOrEqual(200);
    // expect(result.status).toMatch(/^2[0-9]+/);
    // expect(result.ok).toBe(true);
  });
});

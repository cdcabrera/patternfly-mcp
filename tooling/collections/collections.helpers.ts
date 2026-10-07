/**
 * Shared collection utilities for PatternFly MCP collection maintenance scripts.
 */

/**
 * Information extracted from a raw GitHub documentation URL.
 */
interface GitHubUrlInfo {
  owner: string;
  repo: string;
  ref: string;
  filePath: string;
}

/**
 * Repository tracking definition for upstream release queries.
 */
interface TrackedRepository {
  owner: string;
  repo: string;
  branch?: string | undefined;
}

/**
 * Default list of repositories tracked for PatternFly documentation updates.
 */
const DEFAULT_TRACKED_REPOS: TrackedRepository[] = [
  { owner: 'patternfly', repo: 'patternfly-org', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-react', branch: 'main' },
  { owner: 'rh-uxd', repo: 'ai-helpers', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-cli', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-elements', branch: 'main' },
  { owner: 'patternfly', repo: 'patternfly-mcp', branch: 'main' },
  { owner: 'patternfly', repo: 'pf-codemods', branch: 'main' }
];

/**
 * Safely escape and format a field for standard RFC 4180 CSV output.
 *
 * @note **CSV / Formula Injection:** By default (`sanitizeFormulas = true`), leading formula
 * trigger characters are prefixed with a single quote to prevent spreadsheet execution. Pass
 * `false` to preserve strict raw string fidelity for automated downstream parsers.
 *
 * @param field - Value to format for CSV
 * @param [sanitizeFormulas=true] - Whether to prefix formula trigger characters with a single quote
 * @returns RFC 4180 compliant CSV cell string
 */
const escapeCsvField = (field: unknown, sanitizeFormulas = true): string => {
  if (field === null || field === undefined) {
    return '';
  }

  let str = String(field);

  if (sanitizeFormulas && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

/**
 * Format rows and headers into standard CSV string.
 *
 * @param headers - Column headers
 * @param rows - Table rows
 * @returns Formatted RFC 4180 CSV string
 */
const formatCsv = (
  headers: string[],
  rows: (string | number | undefined | null)[][]
): string => {
  const headerLine = headers.map(header => escapeCsvField(header)).join(',');
  const rowLines = rows.map(row => row.map(cell => escapeCsvField(cell)).join(','));

  return [headerLine, ...rowLines].join('\n') + '\n';
};

/**
 * Extract commit hash or ref from a raw GitHub documentation URL.
 *
 * @param url - Raw GitHub URL
 * @returns Hash/ref string or null if not a recognized GitHub raw URL
 */
const extractCommitHash = (url: string): string | null => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\//);

  return match && match[1] ? match[1] : null;
};

/**
 * Extract structured repository and path information from a raw GitHub URL.
 *
 * @param url - Raw GitHub URL
 * @returns GitHubUrlInfo or null if not a recognized raw URL
 */
const extractRepoInfo = (url: string): GitHubUrlInfo | null => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);

  if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    ref: match[3],
    filePath: match[4]
  };
};

/**
 * Probe URL reachability using HTTP HEAD / GET request.
 *
 * @param url - Target URL to probe
 * @param [timeoutMs=5000] - Timeout in milliseconds
 * @returns Promise resolving to true if status is 2xx, false otherwise
 */
const verifyUrlReachability = async (url: string, timeoutMs = 5000): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'patternfly-mcp-audit' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return true;
    }

    // Fallback to GET for hosts that reject HEAD requests
    if (response.status === 405 || response.status === 403) {
      const getController = new AbortController();
      const getTimeoutId = setTimeout(() => {
        getController.abort();
      }, timeoutMs);

      const getResponse = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'patternfly-mcp-audit' },
        signal: getController.signal
      });

      clearTimeout(getTimeoutId);

      return getResponse.ok;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Fetch latest commit hashes for tracked repositories from GitHub API.
 *
 * @param [repos=DEFAULT_TRACKED_REPOS] - Repositories to query
 * @returns Map of "owner/repo" and "repo" to commit SHA
 */
const fetchLatestRepoHashes = async (
  repos: TrackedRepository[] = DEFAULT_TRACKED_REPOS
): Promise<Map<string, string>> => {
  const hashes = new Map<string, string>();

  for (const { owner, repo, branch = 'main' } of repos) {
    const key = `${owner}/${repo}`;

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'patternfly-mcp',
          Accept: 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const data = (await response.json()) as { sha?: string };

        if (data.sha) {
          hashes.set(key, data.sha);
          // Also alias by repository name alone if unique
          hashes.set(repo, data.sha);
        }
      }
    } catch {
      // Fallback: network unavailable or rate limited
    }
  }

  return hashes;
};

export {
  DEFAULT_TRACKED_REPOS,
  escapeCsvField,
  extractCommitHash,
  extractRepoInfo,
  fetchLatestRepoHashes,
  formatCsv,
  verifyUrlReachability,
  type GitHubUrlInfo,
  type TrackedRepository
};

import { writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

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

/**
 * Options for writeJsonCollection.
 */
interface WriteJsonCollectionOptions {
  isPrettyPrint?: boolean;
  startTime?: number;
  stats?: Array<{ label: string; value: string | number }>;
}

/**
 * Serialize data to JSON, write to target path, and log file size and elapsed time.
 *
 * @param targetPath - Absolute or relative file path for JSON output
 * @param data - Data payload to serialize
 * @param [options={}] - Output and logging options
 * @returns Serialized JSON content and formatted metrics
 */
const writeJsonCollection = async <T>(
  targetPath: string,
  data: T,
  options: WriteJsonCollectionOptions = {}
): Promise<{ jsonContent: string; sizeKb: string; durationSec: string }> => {
  const isPretty = options.isPrettyPrint !== false;
  const jsonContent = isPretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  await writeFile(targetPath, jsonContent + '\n', 'utf-8');

  const durationSec = options.startTime ? ((Date.now() - options.startTime) / 1000).toFixed(1) : '0.0';
  const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);

  console.log(`✅ Updated ${targetPath}:`);
  if (options.stats) {
    for (const { label, value } of options.stats) {
      console.log(`   - ${label}: ${value}`);
    }
  }
  console.log(`   - File Size: ${sizeKb} KB`);
  if (options.startTime) {
    console.log(`   - Time Elapsed: ${durationSec}s`);
  }

  return { jsonContent, sizeKb, durationSec };
};

/**
 * Generic lifecycle runner for collection update tasks invoked via environment variables.
 *
 * @param taskName - Human-readable name of the task for logging
 * @param taskFn - Async task function to execute
 * @param [options={}] - Execution options
 * @param [options.envVar='UPDATE_COLLECTIONS'] - Environment variable trigger name
 */
const runUpdateTask = async (
  taskName: string,
  taskFn: () => Promise<unknown>,
  options: { envVar?: string } = { envVar: 'UPDATE_COLLECTIONS' }
): Promise<void> => {
  if (process.env[options.envVar || 'UPDATE_COLLECTIONS'] === 'true') {
    try {
      await taskFn();
    } catch (error) {
      console.error(`❌ Failed to update ${taskName}:`, error);
      process.exit(1);
    }
  }
};

export {
  DEFAULT_TRACKED_REPOS,
  extractCommitHash,
  extractRepoInfo,
  fetchLatestRepoHashes,
  runUpdateTask,
  verifyUrlReachability,
  writeJsonCollection,
  type GitHubUrlInfo,
  type TrackedRepository,
  type WriteJsonCollectionOptions
};

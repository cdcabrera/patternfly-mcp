/* eslint-disable no-console */
import { stat } from 'fs/promises';
import { relative } from 'path';

// Increase per-test timeout to accommodate network requests
;(globalThis as any).jest?.setTimeout(60000);

export type CheckOutcome = 'pass' | 'fail' | 'unknown';

export type CheckResult = {
  target: string;
  kind: 'http' | 'file';
  outcome: CheckOutcome;
  status?: number | null;   // HTTP status when applicable
  reason?: string | null;   // error/failure reason
  snippet?: string | null;  // first 50 chars of body for HTTP
};

const USER_AGENT = 'pf-mcp-link-check/1.0 (+https://github.com/cdcabrera/patternfly-mcp)';
const TIMEOUT_MS = 20_000;

// Repo-root aware redaction helpers to keep snapshots shareable across machines
const repoRoot = process.cwd();
const toRepoRelative = (p: string): string => {
  if (!p || p.startsWith('http://') || p.startsWith('https://')) return p;
  const rel = relative(repoRoot, p);
  return rel || p;
};
const scrubPathFromReason = (reason?: string | null): string | null => {
  if (!reason) return reason ?? null;
  let r = reason.split(repoRoot).join('');
  r = r.replaceAll('///', '/').replaceAll('//', '/');
  return r;
};

export const extractTarget = (s: string): string => {
  const m = s.match(/\]\(([^)]+)\)/);
  const target = m?.[1] ?? s;
  return target.trim();
};

const fetchWithTimeout = async (
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS
): Promise<Response> => {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers = { 'user-agent': USER_AGENT, ...(init.headers || {}) } as any;
    return await fetch(input, { ...init, signal: ctl.signal, headers });
  } finally {
    clearTimeout(id);
  }
};

export const checkHttp = async (url: string): Promise<CheckResult> => {
  try {
    try {
      const headRes = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' });
      if (headRes.ok) {
        const getRes = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
        const text = await getRes.text();
        const snippet = (text || '').slice(0, 50);
        if (getRes.ok && text.trim().length > 0) {
          return { target: url, kind: 'http', outcome: 'pass', status: getRes.status, snippet };
        }
        return { target: url, kind: 'http', outcome: 'fail', status: getRes.status, reason: 'Empty body after HEAD ok', snippet };
      }
    } catch {
      // HEAD may be blocked; fall back to GET below
    }

    const getRes = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
    const text = await getRes.text();
    const snippet = (text || '').slice(0, 50);
    if (!getRes.ok) return { target: url, kind: 'http', outcome: 'fail', status: getRes.status, reason: 'GET non-2xx', snippet };
    if (!text || text.trim().length === 0) return { target: url, kind: 'http', outcome: 'fail', status: getRes.status, reason: 'Empty body', snippet };
    return { target: url, kind: 'http', outcome: 'pass', status: getRes.status, snippet };
  } catch (e: any) {
    return { target: url, kind: 'http', outcome: 'unknown', status: null, reason: scrubPathFromReason(`Error: ${e?.message || String(e)}`), snippet: null };
  }
};

export const checkFile = async (fp: string): Promise<CheckResult> => {
  try {
    const s = await stat(fp);
    if (!s.isFile()) return { target: toRepoRelative(fp), kind: 'file', outcome: 'fail', reason: 'Not a file', status: null, snippet: null };
    if (s.size <= 0) return { target: toRepoRelative(fp), kind: 'file', outcome: 'fail', reason: 'Empty file', status: null, snippet: null };
    return { target: toRepoRelative(fp), kind: 'file', outcome: 'pass', status: null, snippet: null };
  } catch (e: any) {
    return { target: toRepoRelative(fp), kind: 'file', outcome: 'fail', status: null, reason: scrubPathFromReason(`Missing or unreadable: ${e?.message || String(e)}`), snippet: null };
  }
};

/*
  Generate a concise Markdown report of failed (or unknown) link validations.
  Usage:
    npm run report:link-failures

  Notes:
  - Reuses the same helpers used by the Jest link snapshot test to stay consistent.
  - Runs sequentially by default to avoid hitting remote hosts too aggressively.
  - Redacts local absolute paths by truncating them to repo-relative paths.
*/

import { writeFile } from 'fs/promises';
import { join, relative } from 'path';

import {
  extractTarget,
  checkHttp,
  checkFile,
  type CheckResult,
} from '../jest.setupTests.js';

import { LocalReadmes, allDocTargets } from '../src/constants.js';
import { ComponentDocs } from '../src/componentDocs.js';
import { LayoutDocs } from '../src/layoutDocs.js';
import { ChartDocs } from '../src/chartDocs.js';

const buildTargets = (): string[] => {
  const listItems = [...ComponentDocs, ...LayoutDocs, ...ChartDocs];
  const listTargets = listItems.map(extractTarget).filter(Boolean);
  const combined = allDocTargets(listTargets, [], [], LocalReadmes);
  return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b));
};

const now = () => new Date().toISOString();

const mdEscape = (s: string) => s.replaceAll('|', '\\|');

// Redact absolute local paths: convert to repo-relative for display
const repoRoot = process.cwd();
const displayPath = (target: string, kind: CheckResult['kind']): string => {
  if (kind === 'file' && !target.startsWith('http://') && !target.startsWith('https://')) {
    const rel = relative(repoRoot, target) || target;
    return rel;
  }
  return target;
};

const scrubReason = (reason?: string | null): string => {
  if (!reason) return '';
  // Remove any occurrences of the absolute repository path
  let r = reason.split(repoRoot).join('');
  // Clean up duplicated slashes produced by removal
  r = r.replaceAll('///', '/').replaceAll('//', '/');
  return r;
};

async function main() {
  const targets = buildTargets();
  const results: CheckResult[] = [];

  for (const t of targets) {
    const r = t.startsWith('http://') || t.startsWith('https://')
      ? await checkHttp(t)
      : await checkFile(t);
    results.push(r);
  }

  const failures = results.filter(r => r.outcome !== 'pass');
  const passes = results.filter(r => r.outcome === 'pass');

  const header = `# Link Failures Report\n\n` +
    `Generated: ${now()}\n\n` +
    `Summary:\n\n` +
    `- Total targets: ${results.length}\n` +
    `- Passed: ${passes.length}\n` +
    `- Failed/Unknown: ${failures.length}\n\n` +
    `This report is generated from the same sources used by the MCP server and the Jest link snapshot test.\n` +
    `Regenerate with: \`npm run report:link-failures\`\n\n`;

  const tableHeader = `| Target | Kind | Status | Outcome | Reason | Snippet |\n|---|---|---:|---|---|---|\n`;

  const rows = failures.map(f => {
    const status = f.status ?? '';
    const reason = mdEscape(scrubReason(f.reason));
    const snippet = f.snippet ? mdEscape(f.snippet) : '';
    const targetDisplay = mdEscape(displayPath(f.target, f.kind));
    return `| ${targetDisplay} | ${f.kind} | ${status} | ${f.outcome} | ${reason} | ${snippet} |`;
  }).join('\n');

  const content = header + tableHeader + (rows || '| (none) |  |  |  |  |  |') + '\n';
  const outPath = join(process.cwd(), '.agent', 'linkFailuresReport.md');
  await writeFile(outPath, content, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${failures.length} failure(s) to ${outPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate link failures report:', err);
  process.exit(1);
});

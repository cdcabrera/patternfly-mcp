---
name: add-docs-links
description: Adds documentation links to src/docs.json in a structured way. Use when the user asks to add documentation links, contribute to docs.json, register new doc entries, or update the PatternFly MCP documentation catalog.
---

# Add Documentation Links to docs.json

## When to Use

Apply this skill when the user wants to add or register new documentation links in `src/docs.json`. Trigger phrases include: "add documentation links", "add doc entries", "register docs", "update docs.json", "contribute to docs.json", or "update the documentation catalog" (e.g. new component docs, new sources, or new versions).

## Workflow

1. **Resolve the raw URL and ref (git hash/branch)**
   - Decide which GitHub repo and path the doc lives at (e.g. `patternfly/patternfly-org`, `patternfly/patternfly-react`).
   - Prefer using an **existing ref** already present in `src/docs.json` for that repo (keeps `baseHashes.size === 5` per project tests). Extract from an existing entry’s `path` (e.g. `2d5fec39ddb8aa32ce78c9a63cdfc1653692b193` or `v5`).
   - If a new ref is required: look up the GitHub commit SHA (e.g. via GitHub API `GET /repos/{owner}/{repo}/commits?sha={branch}` or repo’s default branch) and use that SHA or a stable tag in the raw URL.

2. **Build the raw URL (must be whitelisted)**
   - The `path` must fall within the PatternFly URL whitelist in `src/options.defaults.ts` (`patternflyOptions.urlWhitelist`). The server only allows fetching from those domains; tool inputs and doc references are validated against it. See [reference.md](reference.md#url-whitelist-allowed-domains).
   - **Maintainer-controlled:** The whitelist is controlled at the maintainer level. It is recommended to avoid updating it; if it is modified, your contribution will be delayed while the new whitelisted domain is reviewed.
   - Allowed bases: `https://patternfly.org`, `https://github.com/patternfly`, `https://raw.githubusercontent.com/patternfly` (any path under each). Use `https` only (`urlWhitelistProtocols`: `http`, `https`).
   - For GitHub content use: `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path-to-file}` (e.g. `patternfly/patternfly-org`, `patternfly/patternfly-react`).

3. **Confirm the URL is reachable**
   - Before adding to `docs.json`, verify the raw URL returns HTTP 200–299 (e.g. `curl -sI -o /dev/null -w "%{http_code}" "<url>"` or use the project’s `tests/audit/utils/checkUrl.ts` logic). If unreachable, fix the ref/path or do not add.

4. **Avoid duplicate paths**
   - Each `path` must be unique across all entries. **Duplicates are automatically checked by the unit tests:** `src/__tests__/docs.json.test.ts` builds a map of every `path` and fails if any path appears in more than one entry, reporting which path is duplicated and in which component/category entries. Run `npm test` (step 7) to confirm; you can optionally scan `docs.json` for an existing `path` before adding to avoid a test failure.

5. **Add the new entry in the correct shape**
   - Use the [entry format](reference.md#entry-format). Insert the new entry into the array for the right component key (create the key if new). Keep keys in **PascalCase** (e.g. `AboutModal`, `Alert`).
   - Preserve existing ordering (e.g. alphabetical by key) if that’s the project convention.

6. **Update `meta`**
   - Recompute and set `meta.totalEntries` = number of top-level keys in `docs`.
   - Recompute and set `meta.totalDocs` = total number of entries across all keys.
   - Optionally set `meta.generated` to current ISO timestamp.

7. **Run unit tests**
   - From repo root: `npm test` (or `jest --selectProjects unit --roots=src/`). The `docs.json` test (`src/__tests__/docs.json.test.ts`) automatically validates: no duplicate `path` values (with a clear error listing duplicates and where they appear), correct `meta.totalEntries` and `meta.totalDocs`, and base-hash count. Fix any failures.
   - If adding a new ref that increases the number of distinct base hashes, the test expects `baseHashes.size` to be 5; coordinate with the team before changing that expectation.

**CI / daily audit:** A GitHub workflow (`.github/workflows/audit.yml`) runs a **daily audit** and also on pull requests that change `src/docs.json` or `tests/audit/**`. It runs the link-audit tests under `tests/audit/` (e.g. `docs.audit.test.ts`), which sample links from `docs.json` and verify they are reachable (HTTP 2xx). New links you add may be sampled and checked; broken or unreachable links can be caught by this workflow.

## Entry Format

Each item in a component’s array in `docs` must have:

| Field         | Type   | Required | Notes |
|---------------|--------|----------|--------|
| `displayName` | string | Yes      | Human-readable name (e.g. "Alert") |
| `description` | string | Yes      | Short description of the doc (e.g. "Design Guidelines for the alert component.") |
| `pathSlug`    | string | Yes      | kebab-case slug (e.g. "about-modal") |
| `section`     | string | Yes      | e.g. `"components"` |
| `category`    | string | Yes      | One of: `design-guidelines`, `accessibility`, `react` |
| `source`      | string | Yes      | e.g. `"github"` |
| `path`        | string | Yes      | Full raw URL; must be unique across all entries |
| `version`     | string | Yes      | e.g. `"v6"`, `"v5"` |

See [reference.md](reference.md) for full schema and examples.

## Quick Checks

- [ ] `path` is within the URL whitelist (see `src/options.defaults.ts` → `patternflyOptions.urlWhitelist`); only `https://patternfly.org`, `https://github.com/patternfly`, or `https://raw.githubusercontent.com/patternfly` (and paths under them).
- [ ] Raw URL uses an existing ref from `docs.json` when possible (keeps base-hash count).
- [ ] Raw URL returns 2xx when fetched.
- [ ] New `path` is not already in `docs.json` (enforced by `docs.json.test.ts` when you run `npm test`).
- [ ] New entry matches the entry format and is placed under the correct PascalCase key.
- [ ] `meta.totalEntries` and `meta.totalDocs` updated.
- [ ] `npm test` passes.
- [ ] Optional: know that a daily CI audit (`.github/workflows/audit.yml`, `tests/audit/`) samples and checks link reachability.

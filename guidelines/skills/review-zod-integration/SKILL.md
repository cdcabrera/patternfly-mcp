---
name: review-zod-integration
description: Reviews Zod dependency upgrades for PatternFly MCP—maps release notes to codebase usage, runs tests, and writes a dated update report with impact tables and prioritized fixes. Use when bumping zod, reviewing zod integration, assessing Zod breaking changes, generating a zod update report, or reviewing Dependabot/Renovate zod PRs.
---

# Review Zod Integration (PatternFly MCP)

## When to use

- User bumps or proposes bumping **`zod`** in `package.json`
- User asks for a **Zod upgrade review**, **integration review**, or **impact analysis**
- Dependabot/Renovate PR for `zod`
- User wants a report comparing **Zod release notes** to this codebase

## Workflow

Copy this checklist and track progress:

```
- [ ] 1. Confirm versions (from → to) and fetch release notes
- [ ] 2. Review repo guidelines (CONTRIBUTING, agent_coding, development.md)
- [ ] 3. Inventory Zod usage (grep patterns + hot paths in reference.md)
- [ ] 3b. Compatibility checks (_def / v3 detection stays additive)
- [ ] 4. Map each release-note item to PF MCP impact
- [ ] 5. Run tests (types, unit, e2e, audit)
- [ ] 6. Write report under `reports/` with required filename
- [ ] 7. Summarize verdict and prioritized fixes for the user
```

### Step 1: Versions and release notes

1. Read `package.json` and `package-lock.json` (`node_modules/zod/package.json` if installed).
2. Note **previous** version from `git log -1 -- package.json` or the bump PR/commit.
3. Fetch release notes for the target minor/major:
   - GitHub: `https://github.com/colinhacks/zod/releases/tag/v{VERSION}`
   - For patch bumps within the same minor (e.g. 4.4.1 → 4.4.3), use the **minor** release notes (e.g. v4.4.0) plus any patch-specific notes if present.
4. List **potentially breaking**, **other fixes**, **performance**, and **locales** sections from the release.
5. **Implementation audit (conditional)**: If release notes are ambiguous or the bump is minor/major:
   - Prefer `node_modules/zod/src/` when shipped (see `files` in `node_modules/zod/package.json`).
   - **Fallback:** If `src/` is absent, read `main`, `module`, and `exports` in `node_modules/zod/package.json`, then search those published paths (e.g. `index.js`, `v3/`) for internal brands and interop behavior.
   - Verify: persistence of `_def` / `_zod`; stability of loose/passthrough logic; v3 interop within the v4 package.

### Step 2: Repo guidelines

Read (do not duplicate into the report):

- `CONTRIBUTING.md` — testing, TypeScript, AI agent section
- `guidelines/agent_coding.md` — schema conversion, `_zod` / `_def` detection
- `guidelines/agent_testing.md` — snapshots, behavior-focused tests
- `docs/development.md` — Zod vs JSON Schema for tools/plugins

### Step 3: Codebase inventory

Run all commands in [reference.md — Grep patterns](reference.md#grep-patterns). Read hot paths in [reference.md — Key files](reference.md#key-files).

Record: **used** vs **not used** per release-note item.

#### Step 3b: Compatibility checks

Per [reference.md — Compatibility Policy](reference.md#compatibility-policy-zod-detection):

- New detection logic must be **additive** (e.g. public `.def` alongside `_zod` / `_def`).
- Do **not** remove legacy `_def` or v3-compatible paths unless Zod release notes show a concrete conflict (false positives or crashes).

### Step 4: Impact matrix

For **every** release-note bullet (breaking, fixes, performance, locales), fill one row in the report tables:

| Column | Content |
|--------|---------|
| **Release note** | Short label from Zod release |
| **Used in PF MCP?** | Yes / No / Indirect — cite file or grep |
| **Impact** | None / Low / Medium / High — effect on tools, plugins, manifests, tests |
| **Priority** | See priority rules below |
| **Recommended fix** | Concrete action, or `None` |

**Priority rules (PF MCP):**

| Priority | When |
|----------|------|
| **P0** | Tests fail, types fail, or runtime/tool registration breaks after bump |
| **P1** | Used API with behavior change; snapshots or plugin manifests need update |
| **P2** | Optional hygiene (adding modern `.def` detection, docs for plugin authors). **Note**: Do NOT remove legacy `_def` or v3-compatible detection logic unless it contradicts the new Zod version. |
| **None** | Not used, or positive/neutral change with passing tests |

For filled-row patterns (breaking / fixes / summary), see [reference.md — Example impact rows](reference.md#example-impact-rows-pf-mcp).

### Step 5: Tests

From repo root:

```bash
npm run test:types
npx jest --selectProjects unit
npm run test:integration
npm run test:audit
```

Record pass/fail counts. Note: full `npm test` may fail on `auditor/` ESLint — treat as pre-existing unless the Zod bump touched `auditor/`.

If tests fail due to Zod: fix code, update snapshots only when output change is correct (`jest -u` scoped to affected files).

### Step 6: Write the report

**Directory:** `reports/` at repository root (gitignored; not for commit unless the user asks)  
**Filename:** `YYYYMMDD-zod-{semver}-update-report.md`

- `YYYYMMDD` = report date (e.g. `20260521`)
- `{semver}` = **target** version without `v` prefix (e.g. `4.4.3` → `reports/20260521-zod-4.4.3-update-report.md`)

Use the template in [reference.md — Report template](reference.md#report-template). Include:

1. Executive summary (verdict table)
2. Test verification table
3. Dependency context (`zod`, `@modelcontextprotocol/sdk` peer range)
4. Zod usage inventory
5. **Release notes vs. PatternFly MCP** — separate tables for breaking / other / performance / locales
6. Documentation and agent guidance status
7. **Recommended fixes** — consolidated list sorted by priority (P0 → P2)
8. Conclusion and references (release URL, bump commit if any)

Do not commit the report unless the user asks.

### Step 7: User summary

Reply with:

- Report path
- **Executive summary verdict table** from the report (code changes required, documentation updates required, risk level — do not collapse to a single safe/needs-work line)
- Count of P0/P1/P2 items
- Link to release notes

## Quick PF MCP facts

- **Zod is Required for SDK Routing**: Any tool registered with the MCP SDK MUST have a Zod instance for its `inputSchema` (even a minimal one like `z.any()`) to ensure the SDK passes user arguments correctly to the handler. Without it, handlers receive only a context object.
- Internal tools **require** Zod or raw Zod shapes; JSON Schema is converted via `src/server.schema.ts`.
- Core APIs: `fromJSONSchema`, `toJSONSchema`, `z.looseObject`, raw shapes with `.optional()` — not `z.undefined()`, `z.tuple()`, `.merge()`.
- MCP SDK peer: `zod ^3.25 || ^4.0`.

## Additional resources

- [reference.md](reference.md) — file map, grep patterns, **report template**, **example impact rows**

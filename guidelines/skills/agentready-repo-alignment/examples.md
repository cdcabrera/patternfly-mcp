# Example: root-level Markdown report

Below is a **fictional** sample showing the intended shape (metadata block, summary table, checklist matrix, priority list, detailed findings with remediation). Status values are **Pass / Fail / N/A** only.

---

```markdown
# AgentReady-style checklist alignment report

**Repository**: example-ui
**Path**: `/home/dev/example-ui`
**Branch / commit**: `main` @ `a1b2c3d`
**Generated**: April 23, 2026
**Checklist archetype**: §4 — React frontend application (single app or primary SPA)
**Skill**: human pass/fail rows (not automated AgentReady scoring)

---

## Summary

| Metric | Value |
|--------|-------|
| **Applicable rows** | 16 |
| **Pass** | 11 |
| **Fail** | 4 |
| **N/A** | 1 |
| **Pass rate (optional)** | 11 ÷ 15 ≈ 73% |

### Classification rationale

- Single `package.json`, React 18 + Vite; no workspace file.
- No `packages/*` layout; primary deliverable is a browser app.

---

## Checklist matrix

| Row | Status | Check (short) | Evidence |
|-----|--------|---------------|----------|
| 1 | Pass | README: env, scripts, Node | `README.md` lists `npm run dev/build/test/lint`, Node 20 |
| 2 | Fail | AGENTS / CLAUDE | Neither file in repo root |
| 3 | Pass | Lockfile + engines | `package-lock.json`; `engines.node` in `package.json` |
| 4 | Fail | `.env.example` | Missing |
| 5 | Pass | TypeScript strict | `tsconfig.json` with `"strict": true` |
| 6 | Fail | API access isolated | `fetch` calls in multiple components under `src/components/` |
| 7 | Pass | Routing / lazy loading | `React.lazy` documented in README Architecture |
| 8 | Pass | Testing | Vitest + RTL; CI job `test` |
| 9 | Fail | Accessibility baseline | No jsx-a11y plugin or documented manual a11y checklist |
| 10 | Pass | CI lint/type/test/build | `.github/workflows/ci.yml` runs all four |
| 11 | Pass | Pre-commit / CI lint | CI fails on ESLint drift |
| 12 | Pass | `.gitignore` | Includes `dist`, `.env`, `coverage` |
| 13 | N/A | Structured logging / Sentry | Internal-only demo; documented as not deployed |
| 14 | Pass | Security headers | README links to hosting CSP for production |
| 15 | Pass | Typed API | `src/api/types.ts` maintained beside OpenAPI link |
| 16 | Pass | Release / preview | Netlify preview branch documented |

---

## Priority improvements

1. **Row 2** — Add `AGENTS.md` (or `CLAUDE.md`) describing router, state, API layer, feature folders, a11y/i18n expectations.
2. **Row 4** — Add `.env.example` listing `VITE_API_BASE_URL` with placeholder values.
3. **Row 6** — Introduce `src/api/client.ts` (or TanStack Query layer) and migrate component `fetch` calls.
4. **Row 9** — Add `eslint-plugin-jsx-a11y` to ESLint config **or** add CONTRIBUTING a11y smoke checklist.

---

## Detailed findings

### Row 2: Agent context file

**Status:** Fail  
**Measured against:** `AGENTS.md` / `CLAUDE.md`: router, state, API layer, feature folders, a11y/i18n expectations  
**Evidence:**
- No `AGENTS.md` or `CLAUDE.md` in repository root (`ls` root).

**Remediation:**
1. Create `AGENTS.md` with sections: Overview, Directory map, Commands, API/data rules, A11y/i18n expectations, PR checklist.
2. Optionally add a one-line `CLAUDE.md` pointing at `AGENTS.md` for cross-tool compatibility.

**Suggested files / updates:** `AGENTS.md` (new), optional `CLAUDE.md` (new).

### Row 4: Environment example

**Status:** Fail  
**Measured against:** `.env.example` (no secrets) lists required configuration  
**Evidence:**
- No `.env.example`; `.env` is gitignored only.

**Remediation:**
1. Add `.env.example` with safe placeholders and comments.
2. Cross-link from README Quick Start.

**Suggested files / updates:** `.env.example` (new), `README.md` (edit).

### Row 6: API access isolation

**Status:** Fail  
**Measured against:** API access isolated—not `fetch` scattered in components  
**Evidence:**
- `grep -r "fetch(" src/components` returns 6 matches across 4 files.

**Remediation:**
1. Add `src/api/` module with typed functions per resource.
2. Refactor components to call hooks or API helpers only.

**Suggested files / updates:** `src/api/` (new tree), targeted component edits.

### Row 9: Accessibility baseline

**Status:** Fail  
**Measured against:** Accessibility baseline (eslint-plugin-jsx-a11y, axe in CI, or manual checklist in CONTRIBUTING)  
**Evidence:**
- ESLint extends `react` only; no jsx-a11y; CONTRIBUTING missing.

**Remediation:**
1. Extend ESLint with `plugin:jsx-a11y/recommended` OR document manual screen-reader + keyboard checks in `CONTRIBUTING.md`.

**Suggested files / updates:** `eslint.config.js` or `.eslintrc.cjs`, `CONTRIBUTING.md`.

---
```

Use this example as a **structural** guide; every real report should use **actual** paths and observations from the audited repository.

---

## Partial-match example (Fail + related resources)

When a row **Fails** strictly but the repo already has **related** documentation, mirror this tone so remediation is not read as “nothing exists—only do X.”

```markdown
### Row 16: ADRs / architecture notes

**Status:** Fail  
**Measured against:** ADRs or architecture notes for major decisions (`docs/adr`, `adr`, or linked doc / numbered ADR series)  
**Evidence:**
- No `docs/adr/`, `adr/`, or numbered ADR series found; README does not link an ADR index.
- **Related resources:** `docs/architecture.md` exists and documents high-level structure — useful context, but the checklist row is not satisfied until ADR location or linked series matches the row text for this archetype.

**Remediation (strict — to pass this row as written):**
1. Add `docs/adr/` (or `adr/`) with `0001-record-architecture-decisions.md` (or project template) **or** add a short “Architecture decisions” section in README linking to a numbered series in-repo.

**Optional / incremental (related resources already present):**
- Fold key decisions from `docs/architecture.md` into the first ADR(s), or add a “See also” from architecture doc to the ADR index once created — **optional** polish; the row still fails until the literal criterion is met.

**Suggested files / updates:** `docs/adr/` (new) or README link block; optional edits to `docs/architecture.md`.
```

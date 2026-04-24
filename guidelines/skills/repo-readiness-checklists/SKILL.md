---
name: repo-readiness-checklists
description: >-
  Runs pass/fail repo readiness audits using five self-contained archetype
  checklists (generic, Markdown docs, React monorepo, React app, Node.js
  service): README, agent context files, lockfiles, CI, tests, boundaries
  between config/domain/I/O, security hygiene, etc. No weighted scores or
  external report files—criteria live in checklists.md beside this skill. Use
  when the user asks for a repo health check, readiness or onboarding audit,
  contributor/agent checklist, or quality gate for docs sites, React
  workspaces, frontends, or Node backends in any workspace.
---

# Repo readiness checklists (pass/fail)

## Source of criteria (portable)

All checklist rows live in **[checklists.md](checklists.md)** in this same directory. **Read that file** at the start of every audit. Criteria are **not** loaded from the repository root or any other path—this skill is self-contained so the folder can be copied to `~/.cursor/skills/repo-readiness-checklists/` or any project’s `.cursor/skills/repo-readiness-checklists/`.

## Workflow

1. **Pick one archetype** from `checklists.md` §1–§5 (confirm with the user if unclear):
   - **§1 Generic** — mixed stack, libraries, polyglot.
   - **§2 Documentation** — Markdown-heavy site or handbook.
   - **§3 React monorepo** — workspaces, shared UI/charts/tokens.
   - **§4 React frontend** — SPA or primary browser app.
   - **§5 Node.js application** — API, worker, or CLI in Node.

2. **Scope** — Mark non-applicable rows **N/A**; exclude N/A from any requested score.

3. **Evidence** — Per row, cite what you inspected (path, workflow file, script name). Avoid content-free passes.

4. **Optional score** — **passes ÷ (passes + fails)** over applicable rows only.

5. **Deliverable** — Table: archetype, row #, pass/fail/N/A, one-line evidence; then ordered gaps and quick wins.

## Separation of concerns

For **§1 Generic**, rows **11–13** are the human definition (config edge, testable domain, thin I/O). The opening section of `checklists.md` explains why **automated** metrics with the same name are often **not** equivalent—do not substitute tool output for those three rows.

## Boundaries

- Does **not** run or score third-party CLI scanners; does not endorse vendor research claims.
- DBT-only, mobile-only, or org compliance rows are **out of scope** unless added to `checklists.md`.
- To extend: edit **`checklists.md`**; if scope changes materially, update this file’s YAML **`description`** so discovery stays accurate.

# Repo readiness checklists (pass/fail)

Plain pass/fail audits inspired by common “AI / contributor readiness” themes (similar in spirit to tools like AgentReady). **No weighted scores** here—only explicit rows you mark pass, fail, or N/A.

**How to use:** Apply one archetype table below. Skip rows that do not fit the stack (mark **N/A**). Optional score: **passes ÷ (passes + fails)** among applicable rows only.

---

## Separation of concerns — plain language (and misleading automation)

**Human meaning** — “Separation of concerns” is **where different kinds of work live**, so changes stay localized and testable:

1. **Configuration and secrets** — Endpoints, API keys, feature flags, and environment-specific behavior come from **config, env, or injected dependencies**, not scattered literals through business logic.
2. **Domain / application rules** — Validation, pricing, authz, state transitions, etc. live in **modules you can unit test** without booting HTTP, UI, or a real database (fakes/in-memory are fine).
3. **I/O at the boundaries** — HTTP handlers, CLI entrypoints, UI handlers, DB/FS/network clients stay **thin**; they delegate inward instead of embedding large slabs of domain code.

**Automation caveat** — Some scanners expose a metric named `separation_of_concerns` that is **not** the above. A typical implementation only checks: (a) absence of directories named `models`, `views`, `controllers`, or `services` under `src/` (or repo root if there is no `src/`); (b) **Python-only** file size heuristics (often scoring **perfect** when there are **zero** `.py` files); (c) penalizing catch-all filenames like `utils.py` / `helpers.py`. **100/100 on an empty or JS-only repo** can mean “nothing triggered those narrow rules,” not good architecture. **Do not treat that automated score as equivalent to the three human rows** in the generic checklist (rows 11–13).

---

## 1. Generic catch-all repository

| # | Check | Pass |
|---|--------|------|
| 1 | Root **`README.md`** explains what the project is, how to install, and how to run the main workflow (build/test/lint) | ☐ |
| 2 | **`AGENTS.md`** or **`CLAUDE.md`** (or equivalent) describes layout, commands, and boundaries for contributors and tooling | ☐ |
| 3 | **Dependency lockfile** present for the primary ecosystem (e.g. `package-lock.json`, `pnpm-lock.yaml`, `uv.lock`, `poetry.lock`, `go.sum`) | ☐ |
| 4 | **`.gitignore`** (or platform equivalent) covers build artifacts, secrets, local tooling, and IDE noise | ☐ |
| 5 | **One-command local setup** documented (e.g. `make`, `task`, `npm install`, `uv sync`) and verified by a maintainer recently | ☐ |
| 6 | **CI** runs on pull requests (lint, tests, or build) and is visible in the default hosting (e.g. GitHub Actions) | ☐ |
| 7 | **Automated dependency or security signals** exist (Dependabot, Renovate, `npm audit` in CI, OSV, etc.)—at least one | ☐ |
| 8 | **Tests** exist for non-trivial logic and run in CI | ☐ |
| 9 | **Pre-commit** or equivalent (format/lint on commit) OR strict CI lint that blocks merges | ☐ |
| 10 | **Reasonable file/module size**—no routine 1k+ line files without justification | ☐ |
| 11 | **Config and secrets at the edge** — URLs, keys, toggles, and environment behavior come from config/env (or a single composition root), not copy-pasted through “business” modules | ☐ |
| 12 | **Domain logic is testable in isolation** — Rules and workflows can be covered by unit tests without booting HTTP, UI, or real databases (fakes/in-memory ok) | ☐ |
| 13 | **I/O stays in adapters** — HTTP routes, CLI commands, DB/FS/network clients are thin; they delegate inward instead of embedding large amounts of domain code | ☐ |
| 14 | **Issue/PR templates** or CONTRIBUTING notes set expectations for reports and changes | ☐ |
| 15 | **Branch protection** (or team rule) on default branch: reviews or required checks before merge | ☐ |
| 16 | **ADRs or architecture notes** for major decisions (folder `docs/adr`, `adr`, or linked doc) | ☐ |
| 17 | **Container or runtime recipe** documented if deployment is non-trivial (Dockerfile, Containerfile, or platform manifest) | ☐ |

---

## 2. Generic documentation repository (Markdown-heavy)

| # | Check | Pass |
|---|--------|------|
| 1 | Root **`README.md`** states audience, scope, how to preview or publish docs, and where the canonical nav lives | ☐ |
| 2 | **`AGENTS.md` / `CLAUDE.md`** lists doc conventions (heading levels, link style, code fence languages, tone) | ☐ |
| 3 | **Clear top-level structure** (`docs/`, `guides/`, `reference/`, or versioned dirs) with an index or sidebar source of truth | ☐ |
| 4 | **Relative links** preferred; broken-link check in CI or scheduled job | ☐ |
| 5 | **Front matter or metadata** consistent if used (title, nav order, status) | ☐ |
| 6 | **Images and assets** live under a predictable path; large binaries avoided or Git LFS documented | ☐ |
| 7 | **Spelling or prose lint** (Vale, cspell, markdownlint) in CI or pre-commit | ☐ |
| 8 | **`.gitignore`** ignores local site build output and editor files | ☐ |
| 9 | **Lockfile** for site generator or Node toolchain if applicable (`package-lock.json`, etc.) | ☐ |
| 10 | **One command** to build or serve docs locally documented and works | ☐ |
| 11 | **CI** builds the doc site (or validates Markdown) on PRs | ☐ |
| 12 | **Contributing** section: how to propose edits, review policy, and style guide link | ☐ |
| 13 | **ADRs** or “decisions” docs for structural or tooling changes to the doc system | ☐ |
| 14 | **Secrets**: no tokens in repo; example env files only with placeholders | ☐ |
| 15 | **Versioning** strategy documented (single main vs version folders vs released branches) | ☐ |

---

## 3. React monorepo (components, charts, styling, etc.)

| # | Check | Pass |
|---|--------|------|
| 1 | Root **`README.md`** explains workspace tool (npm/pnpm/yarn workspaces, Nx, Turborepo), how to bootstrap, and graph of packages | ☐ |
| 2 | **`AGENTS.md` / `CLAUDE.md`** maps packages (`ui`, `charts`, `tokens`, `theme`, apps) and import boundaries | ☐ |
| 3 | **Workspace config** checked in (`package.json` workspaces, `pnpm-workspace.yaml`, etc.) | ☐ |
| 4 | **Root lockfile** committed; **no** ad-hoc per-package lockfiles unless policy says otherwise | ☐ |
| 5 | **Shared ESLint / Prettier / TypeScript** base configs extended by packages—not copy-pasted rules everywhere | ☐ |
| 6 | **`tsconfig` references** or project references (or clear path aliases) so packages build in order | ☐ |
| 7 | **Design tokens / theme** live in a dedicated package or documented single source; charts do not hardcode one-off colors | ☐ |
| 8 | **Components package** exports stable public API; internals not imported across app boundaries | ☐ |
| 9 | **Storybook, Ladle, or similar** for UI packages OR documented alternative for visual review | ☐ |
| 10 | **Tests**: unit tests for logic; visual or a11y checks where agreed for UI | ☐ |
| 11 | **CI** runs affected tests/builds (turbo/nx filter or equivalent) on PRs | ☐ |
| 12 | **Changesets** (or release tool) documented if libraries are published | ☐ |
| 13 | **`.gitignore`** covers build caches, storybook-static, coverage | ☐ |
| 14 | **Dependency/security automation** on root + policy for internal package ranges | ☐ |
| 15 | **OpenAPI or contract** package or folder if shared API types are generated | ☐ |
| 16 | **Container / deploy** story documented for example app or docs site if teams ship from this repo | ☐ |

---

## 4. React frontend application (single app or primary SPA)

| # | Check | Pass |
|---|--------|------|
| 1 | **`README.md`**: env vars, `dev` / `build` / `test` / `lint` commands, supported Node version | ☐ |
| 2 | **`AGENTS.md` / `CLAUDE.md`**: router, state, API layer, feature folders, a11y/i18n expectations | ☐ |
| 3 | **Lockfile** committed; **`engines`** or `.nvmrc` / Volta pin documented | ☐ |
| 4 | **`.env.example`** (no secrets) lists required configuration | ☐ |
| 5 | **TypeScript** (or documented rationale if JS) with strict or staged strictness plan | ☐ |
| 6 | **API access** isolated (e.g. `api/`, RTK Query, TanStack Query)—not `fetch` scattered in components | ☐ |
| 7 | **Routing and lazy loading** documented for large apps; code-splitting considered | ☐ |
| 8 | **Testing**: unit/integration for logic; at least smoke E2E or critical-path tests if user-facing | ☐ |
| 9 | **Accessibility** baseline (eslint-plugin-jsx-a11y, axe in CI, or manual checklist in CONTRIBUTING) | ☐ |
| 10 | **CI** runs lint, typecheck, tests, and production build on PRs | ☐ |
| 11 | **Pre-commit** optional; CI must catch formatting/lint drift | ☐ |
| 12 | **`.gitignore`** includes `dist`, `build`, `.env`, coverage, Playwright/Cypress artifacts | ☐ |
| 13 | **Structured logging** or client error reporting (Sentry, etc.) for production if applicable | ☐ |
| 14 | **Security headers / CSP** or hosting config referenced if app is public | ☐ |
| 15 | **OpenAPI / typed client** or hand-maintained types if backend contract exists | ☐ |
| 16 | **Release / preview** flow documented (branch, tags, Vercel/Netlify/GitHub Pages) | ☐ |

---

## 5. Node.js application (services, APIs, CLIs)

| # | Check | Pass |
|---|--------|------|
| 1 | **`README.md`**: run locally, required services (DB, queue), ports, and main scripts | ☐ |
| 2 | **`AGENTS.md` / `CLAUDE.md`**: module layout, error-handling pattern, logging, and “do not log secrets” | ☐ |
| 3 | **Lockfile** + **`engines`** (or container base image) pinned | ☐ |
| 4 | **Config via environment**; **`.env.example`** without secrets | ☐ |
| 5 | **Structured logs** (JSON or key=value) in server paths; log levels documented | ☐ |
| 6 | **Health (liveness/readiness)** endpoints or equivalent for orchestrated deploys | ☐ |
| 7 | **Graceful shutdown** (close server, DB pool, subscribers) documented and implemented | ☐ |
| 8 | **OpenAPI / GraphQL schema** or RPC contract published or versioned if external consumers exist | ☐ |
| 9 | **Input validation** at boundaries (zod, joi, OpenAPI validator, etc.) | ☐ |
| 10 | **Tests** for handlers/services; CI runs them | ☐ |
| 11 | **Lint + typecheck** in CI; optional pre-commit | ☐ |
| 12 | **`.gitignore`** covers `node_modules`, build output, local `.env`, coverage | ☐ |
| 13 | **Dependency automation** (Dependabot/Renovate) + policy for major bumps | ☐ |
| 14 | **Secrets**: no keys in repo; CI uses OIDC or secret store where possible | ☐ |
| 15 | **Dockerfile/Containerfile** or platform manifest matches how the app is actually run | ☐ |
| 16 | **Observability** hooks (metrics/tracing) or documented gap for production | ☐ |
| 17 | **Rate limiting / authn-authz** documented for public HTTP APIs | ☐ |

---

## Optional: map rows to AgentReady-style attribute ids

If you compare against a scanner that uses these ids: `claude_md_file`, `readme_structure`, `lock_files`, `dependency_security`, `test_coverage`, `precommit_hooks`, `gitignore_completeness`, `one_command_setup`, `standard_layout`, `issue_pr_templates`, `architecture_decisions`, `openapi_specs`, `container_setup`, `structured_logging`, `cyclomatic_complexity`, `code_smells`, `semantic_naming`, `type_annotations`, `branch_protection`, `cicd_pipeline_visibility`.

**Do not equate** automated `separation_of_concerns` scores with checklist rows 11–13 in §1; see *Separation of concerns — plain language* above.

---

*Extend or fork this file for org-specific compliance rows (SOC2, license headers, etc.).*

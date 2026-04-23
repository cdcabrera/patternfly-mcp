# Reference: influences, mapping, caveats

## Influence and scope

Checklist themes are **influenced by** the AgentReady project and similar “agent readiness” assessors: [https://github.com/ambient-code/agentready](https://github.com/ambient-code/agentready).

This skill does **not** execute AgentReady, does **not** reproduce its weighted scores or tiers, and does **not** claim parity with any hosted report format. It provides **human** pass/fail rows and Markdown reports in a **similar narrative layout** (summary → priorities → detailed findings).

## Separation of concerns: human rows vs automation

Automated tools may label a metric `separation_of_concerns` while measuring **narrow heuristics** (directory names, Python-only file sizes, banned filenames). That is **not** the same as §1 rows **11–13** in [checklists.md](checklists.md). When reconciling with any scanner output, treat those automated numbers as **weak signal** for JS/TS-only or very small repos.

## Optional cross-walk to common attribute ids

See the bottom of [checklists.md](checklists.md) for an optional list of ids used by some scanners. Use it only to explain gaps to stakeholders who already speak that vocabulary—**do not** add hidden scoring.

## Archetype selection reminders

| Archetype | Strong signals |
|-----------|------------------|
| §1 Generic | Mixed stacks, libraries, polyglot, or unclear primary surface |
| §2 Documentation | Dominant Markdown/site generators, `docs/` nav, few app entrypoints |
| §3 React monorepo | `pnpm-workspace.yaml`, `package.json` workspaces, Nx/Turborepo, multiple `packages/` |
| §4 React app | Single-app React/Vite/Next/Cra; primary SPA or browser app |
| §5 Node.js service | Server frameworks (Express/Fastify/Nest), workers, CLIs; not primarily a SPA repo |

When two sections fit, prefer the **more specific** table; if still unclear, use **§1** and document why.

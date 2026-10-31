# Commit breakout loop — examples

## Example plan (API + tests split)

**Feature**: Add `searchDecisions` tool with Zod schema and unit tests

| # | Commit title | Scope | Depends on | Verification |
|---|--------------|-------|------------|--------------|
| 1 | add decision search schema and types | `src/decisions/schema.ts`, exports | — | `npm run test:types`, targeted jest |
| 2 | wire searchDecisions MCP tool | tool registration, handler | 1 | `npm test` |
| 3 | document searchDecisions in catalog | `src/docs.json` or tool meta | 2 | `npm test`, spell if docs touched |

## Example per-commit announcement

```text
Commit 2/3: wire searchDecisions MCP tool
Scope: src/tools/searchDecisions.ts, server registration only — no docs yet.
Verification target: npm test
```

## Example review loop iteration

1. `npm test` fails on lint in new file → fix (`1/10`) → re-run `npm run test:lint` then `npm test`.
2. Self-review: missing error path when query empty → add test + handler (`2/10`) → `npm test` again.
3. At `10/10`, stop fixing; propose check-in with deferred items listed even if one Medium finding remains.
4. Propose commit message:

```text
feat(tools): register searchDecisions MCP handler

Expose catalog search so agents can query prior decisions without loading full logs.
```

## Plan amendment

If commit 2 reveals commit 1’s type was wrong:

1. Stop before checking in commit 2.
2. Propose amended plan (e.g. insert 1b or extend commit 1 with a fix commit).
3. Get approval, then continue the loop.

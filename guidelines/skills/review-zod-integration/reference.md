# Review Zod Integration — Reference (PatternFly MCP)

## Key files

| File | Zod role |
|------|----------|
| `src/server.schema.ts` | `isZodSchema`, `isZodRawShape`, `jsonSchemaToZod`, `normalizeInputSchema`, `zodToJsonSchema`; v3 `_def` / v4 `_zod` detection |
| `src/server.tools.ts` | `z.looseObject({})` Tools Host fallback |
| `src/server.toolsHost.ts` | Normalize plugin schemas; manifest JSON Schema via `zodToJsonSchema` |
| `src/server.toolsUser.ts` | `normalizeInputSchema` for inline/static tools |
| `src/options.assertions.ts` | `z.array(z.string().url().refine(...))` |
| `src/tool.patternFlyDocs.ts` | Raw Zod shape (`z.array`, `z.string`, `z.enum`, `.optional()`) |
| `src/tool.searchPatternFlyDocs.ts` | Same |
| `src/__tests__/server.schema.test.ts` | Conversion tests + `toJSONSchema` snapshots |
| `docs/development.md` | Plugin/tool schema terminology |
| `guidelines/agent_coding.md` | Zod detection guidance |

## Grep patterns

```bash
# All Zod imports
rg "from ['\"]zod['\"]" .

# Schema pipeline
rg "fromJSONSchema|toJSONSchema|normalizeInputSchema|jsonSchemaToZod|isZodSchema|isZodRawShape" src

# Breaking-change-prone APIs
rg "z\.(tuple|undefined|base64|httpUrl|cuid|record|discriminatedUnion|function)|\.merge\(|\.passthrough|looseObject|\.prefault" src

# Error formatting (snapshot risk)
rg "ZodError|formatError|treeifyError" src
```

## APIs typically unused in PF MCP

If release notes only mention these, impact is usually **None**:

`z.tuple`, `z.undefined`, `.merge()`, `z.base64`, `z.httpUrl`, `z.cuid`, `z.record` (key transforms), `z.discriminatedUnion`, `z.function`, `z.map`/`z.set` with `.default()`, empty unions, custom Zod locales.

## APIs in active use

| API | Where |
|-----|--------|
| `fromJSONSchema` | `jsonSchemaToZod` |
| `toJSONSchema` | `zodToJsonSchema`, default `draft-2020-12` |
| `z.object` / raw shapes | Built-in tools, `normalizeInputSchema` |
| `z.looseObject` | `server.schema.ts`, `server.tools.ts`; Standard for "open" tool inputs in Zod 4.4+ |
| `z.string().url()` + `.refine` | `options.assertions.ts` |
| `z.enum`, `.optional()`, `.max()`, `.min()` | Tool input schemas |

## Dependencies

| Package | Notes |
|---------|--------|
| `zod` | Direct production dep; use native `fromJSONSchema` / `toJSONSchema` (not `zod-to-json-schema` in app code) |
| `@modelcontextprotocol/sdk` | Depends on / peers `zod ^3.25 \|\| ^4.0` |

## Audit Depth Policy

| Source | Frequency | Objective |
| :--- | :--- | :--- |
| **Release Notes** | Always | Identify public API changes and security fixes. |
| **Package Metadata** | Always | Verify peer dependencies and entry points. |
| **Source Code Audit** | Minor/Major Bumps | Validate internal state and undocumented behavioral shifts. |

## Report template

Save as: **`YYYYMMDD-zod{version}-update-report.md`** (repo root).

```markdown
# Zod {version} Update Report — PatternFly MCP

**Date:** YYYY-MM-DD
**Zod versions:** {from} → {to}
**Release reference:** [Zod v{X.Y.Z}](https://github.com/colinhacks/zod/releases/tag/v{X.Y.Z})

## Executive summary

| Verdict | Detail |
|---------|--------|
| **Code changes required** | None / … |
| **Documentation updates required** | None / … |
| **Risk level** | Low / Medium / High |

[1–2 sentences on overall safety.]

---

## Test and build verification

| Command | Result |
|---------|--------|
| `npm run test:types` | |
| `npx jest --selectProjects unit` | |
| `npm run test:integration` | |
| `npm run test:audit` | |

---

## Dependency context

| Package | Version | Zod relationship |
|---------|---------|------------------|
| `zod` | | |
| `@modelcontextprotocol/sdk` | | peer range |

---

## Zod usage inventory (PatternFly MCP)

| Location | Usage |
|----------|--------|
| | |

### APIs not used in this repo

[List from grep.]

---

## Release notes vs. PatternFly MCP

### Potentially breaking changes

| Release note | Used in PF MCP? | Impact | Priority | Recommended fix |
|--------------|-----------------|--------|----------|-----------------|
| | Yes/No/Indirect | None/Low/Medium/High | P0/P1/P2/None | |

### Other behavioral fixes

| Release note | Used in PF MCP? | Impact | Priority | Recommended fix |
|--------------|-----------------|--------|----------|-----------------|
| | | | | |

### Performance / packaging

| Release note | Impact on PF MCP | Priority | Recommended fix |
|--------------|------------------|----------|-----------------|
| | | | |

### Locales

| Release note | Impact on PF MCP | Priority | Recommended fix |
|--------------|------------------|----------|-----------------|
| | | | |

---

## Documentation and agent guidance

| Asset | Status |
|-------|--------|
| `docs/development.md` | |
| `docs/examples/*` | |
| `guidelines/agent_coding.md` | |
| `tests/e2e/` | |

---

## Recommended fixes (consolidated)

Sorted by priority.

### P0 — Must fix

| Item | Recommended fix |
|------|-----------------|
| | |

### P1 — Should fix

| Item | Recommended fix |
|------|-----------------|
| | |

### P2 — Optional

| Item | Recommended fix |
|------|-----------------|
| | |

---

## Conclusion

[Final verdict.]

---

## References

- [Zod release notes](URL)
- Bump commit: `hash` (if applicable)
```

## Example impact rows (PF MCP)

Use these as patterns when mapping **your** target release notes. Re-grep the codebase every review—do not assume rows copy forward unchanged.

### Potentially breaking — sample rows

| Release note | Used in PF MCP? | Impact | Priority | Recommended fix |
|--------------|-----------------|--------|----------|-----------------|
| Tuple defaults / dense optional tails | No — no `z.tuple()` | None | None | None |
| Required keys with `z.undefined()` | No — tools use `.optional()` on keys | None | None | None |
| `.merge()` throws when receiver has refinements | No — no `.merge()` | None | None | None |
| `toJSONSchema()` strips redundant `id` in `$defs` | Yes — `zodToJsonSchema`, Tools Host manifest | Low — no code reads `$defs.id` | None | None; re-run `server.schema` snapshots if manifest output changed |
| `z.httpUrl()` stricter URL validation | No — uses `z.string().url()` + `refine` in `options.assertions.ts` | None | None | None |
| Floating-point accuracy (`multipleOf`) | No — `multipleOf` not used in schemas | None | None | None |

### Other fixes — sample rows

| Release note | Used in PF MCP? | Impact | Priority | Recommended fix |
|--------------|-----------------|--------|----------|-----------------|
| `fromJSONSchema()` metadata / cyclic input handling | Yes — `jsonSchemaToZod` | Low positive — plugin conversion may differ | None | Monitor plugin edge cases; no code change if tests pass |
| **Metadata retention (round-trip preservation)** | Yes — `fromJSONSchema` / `toJSONSchema` | Low — snapshots may include extra keys | None | Update snapshots if custom keys are now preserved; no code change |
| `z.record()` key transforms | No | None | None | None |
| Skip `__proto__` in object catchall | Indirect — object parsing in tools/options | Low positive | None | None |
| Empty union construction | Indirect — via JSON Schema conversion | Low positive — safer conversion | None | None |

### Performance / locales — sample rows

| Release note | Impact on PF MCP | Priority | Recommended fix |
|--------------|------------------|----------|-----------------|
| Lazy-bound builder methods | Transparent runtime improvement | None | None |
| Locale message text changes | No custom Zod locale in repo | None | None |

### Example executive summary (safe minor bump)

```markdown
| Verdict | Detail |
|---------|--------|
| **Code changes required** | None |
| **Documentation updates required** | None |
| **Risk level** | Low |

No release-note item maps to APIs used in PF MCP hot paths; unit, e2e, and audit tests pass.
```

### Example consolidated fixes (typical clean bump)

```markdown
### P0 — Must fix
(none)

### P1 — Should fix
(none)

### P2 — Optional
| Item | Recommended fix |
|------|-----------------|
| v3 `passthrough()` fallback in `server.schema.ts` | Remove when repo only supports Zod 4.x |
| Plugin authoring | Note in `docs/development.md`: prefer JSON Schema or Zod 4.x aligned with server |
```

## Architecture

### SDK Routing Trigger
The MCP SDK requires `inputSchema` to be a Zod instance to route `(args, context)` to tool handlers. We rehydrate minimal Zod in the parent process (via `normalizeInputSchema`) specifically to trigger this signature, while keeping genuine validation in the isolated child process.

## Compatibility Policy (Zod Detection)

To support a diverse plugin ecosystem, PatternFly MCP maintains a "Compatibility-First" approach for Zod schema detection.

### Preservation Rules:
1. **Never Remove `_def` Detection**: Even when pinned to Zod 4+, the `isZodSchema` function in `src/server.schema.ts` must keep the `_def` check to support plugins using Zod v3.
2. **Additive Detection**: When Zod introduces new public APIs (like `.def` in v4.4), add detection for them *alongside* existing internal brands (`_zod`, `_def`).
3. **Exceptions**: Legacy detection should only be removed if the Zod release notes indicate that a legacy property (e.g., `_def`) has been repurposed in a way that causes false positives or crashes in the current version.

### Updated P2 Recommendations (Recurring):
- **DO**: Add detection for the public `.def` property (Zod 4.4+).
- **DO**: Update `docs/development.md` to recommend JSON Schema or Zod 4 for *new* plugins.
- **DO NOT**: Remove the v3 `_def` branch in `isZodSchema`.
- **DO NOT**: Remove the `passthrough()` fallback in `jsonSchemaToZod` if there is any risk of the server being run in an environment with an older Zod instance.

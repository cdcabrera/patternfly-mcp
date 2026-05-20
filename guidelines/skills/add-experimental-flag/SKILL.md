---
name: add-experimental-flag
description: Adds a new experimental feature flag to the MCP server. Use when the user wants to implement a PoC, a feature subject to change, or an opt-in capability requiring the --experimental- prefix.
---

# Add Experimental Flag

## When to use

Use this skill when introducing a feature that is not yet stable. Experimental flags provide a "safety signal" to users, requiring explicit acknowledgment via `--experimental-` (CLI) or `experimental` (programmatic) prefixes.

## Workflow

1. **Register the Option Key**
   - Update `type PfMcpExperimentalOptions` and the `EXPERIMENTAL_OPTIONS` Set in `src/index.ts`.

2. **Define Defaults**
   - Add the property to the `DefaultOptions` interface and `DEFAULT_OPTIONS` object in `src/options.defaults.ts`.
   - Use the **internal key name** (e.g., `testLog`), not the prefixed version.

3. **Configure CLI Parsing**
   - Update the `CliOptions` type in `src/options.ts`.
   - Add a `case` for the non-prefixed flag (e.g., `--test-log`) in the `parseCliOptions` switch statement. The framework automatically handles the `--experimental-` prefixing/stripping.

4. **Implement Feature Logic**
   - Use the flag in the core logic (typically `src/server.ts`) by checking `options.yourFlagName`.

5. **Testing**
   - **Unit**: Add a case to `src/__tests__/options.test.ts` for both CLI and programmatic parsing.
   - **E2E**: Add a verification test in `tests/e2e/stdioTransport.test.ts` to ensure the flag triggers the expected behavior.

## Quick checks

- [ ] Flag registered in `src/index.ts`.
- [ ] Default value (usually `false`) added to `src/options.defaults.ts`.
- [ ] CLI switch case added to `src/options.ts`.
- [ ] Implementation uses the internal key name.
- [ ] Tests verify both `--experimental-` prefixing and the resulting logic.

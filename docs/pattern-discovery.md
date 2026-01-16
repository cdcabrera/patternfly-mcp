# Pattern Discovery Tool (Spec)

The **Pattern Discovery** tool is a planned core utility designed to help LLMs and developers identify high-level PatternFly design patterns that span multiple components.

## Objective
While `usePatternFlyDocs` provides component-level details, the Pattern Discovery tool bridges the gap by providing "compositional context"—helping users understand how components should be combined to solve specific user interface problems.

## Proposed Interface
- **Tool Name**: `discoverPattern`
- **Arguments**:
  - `intent`: (string) The user's goal (e.g., "Build a dashboard", "Complex data filter").
  - `components`: (array of strings, optional) Specific components the user wants to use.
- **Returns**:
  - A list of recommended Layouts (e.g., `Gallery`, `Grid`, `Bullseye`).
  - Common composition patterns (e.g., "Toolbar + Table + Pagination").
  - Accessibility requirements and keyboard interaction specs for the specific composition.

## Implementation Roadmap
- [ ] Define the pattern registry (initially a static map in `src/docs.patterns.ts`).
- [ ] Implement the `discoverPattern` tool creator.
- [ ] Integrate with `AsyncLocalStorage` for session-based discovery history.

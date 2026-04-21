# Release blog post — reference

## Output path and naming

- **Directory:** `blog/` (repo root; listed in `.gitignore`; not committed).
- **Pattern:** `blog/YYYY-MM-DD-release-<semver>.<ext>` — ISO **date**, literal `-release-`, **semver** for that release (e.g. from `CHANGELOG.md` / `package.json`), **extension** for the chosen format (default `.md`).

## Default Markdown template

Use as a starting point; rename sections if the release is small or mostly maintenance.

```markdown
# PatternFly MCP <version>: <short title>

**Release date:** <YYYY-MM-DD from CHANGELOG or user>  
**Full changelog:** [CHANGELOG.md](../CHANGELOG.md) (anchor to the `<version>` section when linking in published HTML)

## Highlights

- <user-facing outcome 1>
- <user-facing outcome 2>

## Breaking changes

<!-- Omit section if none. Quote or closely paraphrase CHANGELOG; link to PRs already listed there. -->

## What changed

### Features
### Fixes
### Documentation
### Builds / dependencies

<!-- Merge or drop headings to mirror the release’s CHANGELOG sections. -->

## Upgrade notes

<!-- Only if CHANGELOG or docs describe migration; cite paths you verified. -->

## Links

- [Usage](../docs/usage.md)
- [Development / CLI](../docs/development.md)
- [Architecture](../docs/architecture.md)
```

Files live in gitignored **`blog/`** at repo root (e.g. `blog/2026-03-30-release-1.0.0.md`). From there, one `../` reaches the repo root for links like above.

## Sources to re-read each time

Paths are conventional for this repo; **confirm with `Glob` or listing** before relying on them in a post.

| Purpose | Typical locations |
|---------|-------------------|
| Version and scripts | `package.json` |
| Release facts | `CHANGELOG.md` |
| Orientation + links hub | `README.md`, `docs/README.md` |
| Deep context | `docs/architecture.md`, `docs/usage.md`, `docs/development.md`, `docs/examples/**` |
| Contributors | `CONTRIBUTING.md` |
| Catalog / tools behavior | `src/docs.json` (large), tests under `src/__tests__/` only if the post discusses tooling |

## When documentation shifted

- Re-locate moved files with search; update links in the draft to match **current** paths.
- If a cited section no longer exists, remove the claim or replace with wording supported by another open file.

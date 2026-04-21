---
name: release-blog-post
description: "Drafts a per-release blog article from current repository documentation and writes it under gitignored blog/ using the filename pattern YYYY-MM-DD-release-<semver> plus a format-appropriate extension (default .md). Use when the user asks for a blog, blog post, release post, release blog, or announcement tied to a version or release."
---

# Release blog post

## When to use

The user wants a **release-facing article** (blog, release notes narrative, announcement) for a specific version or tag. Output format is **Markdown by default**; switch if they ask (HTML, email, social thread outline, etc.).

## Principles

1. **Truth source is the repo today** — Read `CHANGELOG.md`, `package.json` (`version`), and the docs the post will cite. Do not assume paths or section titles from memory; repo docs **move and rename**.
2. **Discover then read** — If a remembered path is missing, search (`Glob`/grep) under `docs/`, `guidelines/`, and repo root before citing. Prefer stable in-repo **relative** links in the draft (e.g. `./docs/usage.md`) and verify targets exist.
3. **Changelog-first story** — Anchor the narrative on the target release section in `CHANGELOG.md` (features, breaking changes, fixes). Expand with “why it matters” using architecture/usage docs only when it matches what you read.
4. **Honest scope** — Call out breaking changes and migration hints that appear in `CHANGELOG.md` or `docs/`; do not invent upgrade steps.

## Workflow

1. **Version** — Confirm target version (user input, `package.json`, or git tag). If unclear, ask once.
2. **Collect facts** — Read the matching `CHANGELOG.md` section and skim `README.md`, `docs/README.md`, and any doc files the release touches (e.g. `docs/architecture.md`, `docs/usage.md`, `docs/development.md`, `CONTRIBUTING.md`). Pull 1–2 accurate quotes or paraphrases only from files you opened.
3. **Draft** — Use the default structure in [reference.md](reference.md#default-markdown-template). Tone: clear, technical blog; audience matches PatternFly MCP users (integrators, IDE users, embedders).
4. **Deliver** — Save under the repo-root **`blog/`** directory (gitignored). **File name:** `YYYY-MM-DD-release-<semver>.<ext>` — **date:** ISO, prefer the date in `CHANGELOG.md` for that version (else user-supplied or today). **semver:** the release version (e.g. `1.0.0` from the matching `CHANGELOG.md` heading or `package.json` `version`). **Extension:** match the output format (default `.md`; e.g. `.html`, `.mdx` if requested). Create `blog/` if missing. Only use a different path if the user explicitly overrides.
5. **Optional footer** — One line noting key files consulted (relative paths) helps reviewers validate after doc moves.

## Format

| User asks for | Extension (examples) | Action |
|---------------|----------------------|--------|
| (default) | `.md` | Markdown using [reference.md](reference.md#default-markdown-template) |
| HTML | `.html` | Same facts; valid HTML fragment or full document as requested |
| MDX / other | `.mdx`, etc. | Match extension to format; keep the same factual steps (changelog + verified docs) |
| Email / social outline | `.md` (or user preference) | Same naming rule unless they specify another extension |

## Additional resources

- Default template and source checklist: [reference.md](reference.md)

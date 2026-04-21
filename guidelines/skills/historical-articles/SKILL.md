---
name: historical-articles
description: "Researches git history and current repo docs to draft a longform historical narrative (origins, evolution, milestones), default Markdown, saved under gitignored blog/ as YYYY-MM-DD-history-<slug>.<ext>. Incorporates optional user-supplied paragraphs or an outline as structure and voice, verified and expanded against the repo. Use when the user asks for a historical article, history of the project, origins story, evolution, git archaeology, how the repo or MCP was created, a narrative spanning multiple releases, or to refine their own outline or draft with accurate history."
---

# Historical articles

## When to use

The user wants a **time-spanning narrative** about this repository (origins, how it evolved, major pivots), not a **single-release** announcement. For the latter, use [release-blog-post](../release-blog-post/SKILL.md).

Default output is **Markdown**; change extension and shape if they ask (HTML, outline for a talk, etc.).

The user may paste a **starter outline** or **draft paragraphs**. Treat that as the **spine** (sections, emphasis, anecdotes they care about), not as ground truth: **merge** it with git and docs—confirm dates, ordering, and technical claims; **add** citations (tags, SHAs, paths); **tighten** or **correct** where evidence disagrees, and say so briefly when the record contradicts their text.

## Principles

1. **Git is primary evidence; docs add meaning** — Use `git` (tags, log, merges, `git show`) to anchor dates, versions, and what landed when. Use **current** `docs/`, `CHANGELOG.md`, and `README.md` for how the project describes itself today; use `git show <rev>:<path>` only when reconstructing a specific past file is worth the cost.
2. **Select milestones; do not dump the log** — A useful article groups commits into **phases** (e.g. bootstrap, MCP shape, docs catalog, breaking resource migration). Prefer **tags** and **CHANGELOG** section headers as chapter boundaries when they exist.
3. **Discover paths** — Same as other writing skills: verify file paths with search; repo layout changes over time.
4. **Honest limits** — Do not invent motivations or meetings. If the log is silent, say so or stick to observable outcomes (files added, APIs changed). Cite **commit SHAs** or **tag names** for strong claims when practical.
5. **Scope the question** — If the prompt is vague (“full history”), agree on **time bounds**, **audience**, and **length** (or outline-first) before deep `git` work.
6. **User seed, repo truth** — If they supplied an outline or paragraphs, **map** each part to evidence (commits, tags, `CHANGELOG.md`, docs). Keep their **intent and flow** where it matches the record; **revise** claims that do not; **fill** gaps they left open with sourced detail.

## Workflow

1. **Brief** — Confirm topic, audience, time span, and target length (or deliver an outline first if the scope is large). **Capture any user outline or draft** in the working plan (sections, key sentences they want preserved).
2. **Timeline skeleton** — From repo root, gather: `git tag` (sorted), first/early commits (`git log --reverse`), and **CHANGELOG.md** for versioned narrative. Optionally `git log --merges` or search by subject for known themes the user names.
3. **Deepen selectively** — For each milestone, inspect a **small** set of commits (messages, touched paths). Use `git show --stat <sha>` or `git diff <parent>..<sha> --stat` when a change needs explanation.
4. **Cross-check today** — Read `docs/architecture.md`, `docs/README.md`, or other hub docs so the closing “where things stand” matches the tree **now**.
5. **Draft** — Follow [reference.md](reference.md#default-markdown-outline). Weave in the **user seed** per [reference.md](reference.md#merging-user-outlines-or-paragraphs). Narrative tone; technical accuracy over hype.
6. **Deliver** — Save under repo-root **`blog/`** (gitignored, same as release drafts). **File name:** `YYYY-MM-DD-history-<slug>.<ext>` — **date:** ISO (draft date or “as of” date the user wants on the file). **slug:** short **kebab-case** ASCII derived from the topic (e.g. `mcp-origins`); keep it readable, roughly under 48 characters. **Extension:** default `.md`; match other formats if requested. Create `blog/` if missing. Override path only if the user explicitly asks.

## Relationship to other skills

| Intent | Skill |
|--------|--------|
| One version, announcement, `CHANGELOG`-driven | [release-blog-post](../release-blog-post/SKILL.md) |
| Multi-era story, git-driven arc | This skill |

## Format

| User asks for | Extension (examples) | Action |
|---------------|----------------------|--------|
| (default) | `.md` | Markdown; [outline](reference.md#default-markdown-outline) |
| HTML / MDX | `.html`, `.mdx` | Same research steps; match extension |

## Additional resources

- Outline, slug rules, and git command hints: [reference.md](reference.md)

# Historical articles — reference

## Output path and naming

- **Directory:** `blog/` (repo root; `.gitignore`; shared with release drafts).
- **Pattern:** `blog/YYYY-MM-DD-history-<slug>.<ext>`
- **slug:** Lowercase kebab-case, digits allowed; no spaces. Summarize the topic (e.g. `patternfly-mcp-origins`, `docs-json-evolution`). Avoid empty or generic slugs like `article`.

## Default Markdown outline

Adapt depth to requested length.

```markdown
# <Title>

**Scope:** <time range> · **Audience:** <who>  
**Sources:** git history (this repo), `CHANGELOG.md`, and docs as cited below.

## Context

<Why this story matters; what PatternFly MCP is today in one paragraph.>

## Timeline / phases

### <Phase name> (<approx. era or tag range>)

- <Outcome or decision>
- <Key commit or tag, e.g. `abc1234` or `v0.5.0` — optional>

### <Next phase>

…

## Turning points

<!-- Optional: breaking changes, renames, MCP protocol shifts — tie to tags/CHANGELOG when possible. -->

## Where things stand

<!-- Ground in current docs you opened: architecture, usage, etc. -->

## Further reading

- <Relative links to `docs/` files verified on disk>
```

From `blog/*.md`, link to repo files with `../` (one level up to repo root).

## Merging user outlines or paragraphs

When the user provides an **outline** (bullets, headings) or **draft paragraphs**:

1. **Inventory** — List their headings or paragraph roles (what each block is trying to say).
2. **Verify** — For factual claims (dates, “first X”, “then we Y”, file or API names), check `git`, `CHANGELOG.md`, and current or historical paths. **Do not** ship contradictions: fix the draft or add a short caveat if evidence is ambiguous.
3. **Enhance** — Under each section, add **concrete anchors**: commit SHAs, tag names, PR numbers from commit messages, or doc links you verified.
4. **Preserve voice** — Keep their wording when it is **accurate**; prefer light edits over full rewrites unless accuracy requires it.
5. **Order** — If their timeline order disagrees with the log, **reorder** to match evidence and note the correction only if it would confuse a reader who saw the old draft.

If they gave only an outline, **expand** bullets into prose using the same sourcing rules as a from-scratch article.

## Git: practical commands

Run from repository root. Adjust `-n` and ranges to keep output reviewable.

| Goal | Example |
|------|---------|
| Tags | `git tag --sort=creatordate` |
| Repo begins | `git log --reverse --oneline -n 30` |
| Recent history | `git log --oneline -n 40` |
| One commit detail | `git show -s --format=fuller <sha>` |
| Files touched | `git show --stat <sha>` |
| Log by path | `git log --oneline -n 20 -- docs/architecture.md` |
| Past file snapshot | `git show <sha>:docs/architecture.md` (only when needed) |

Prefer **summaries** over pasting thousands of lines into the article.

## When git and docs disagree

- **CHANGELOG** and **tags** usually win for “what shipped when.”
- **Current docs** win for “how it works now.”
- If old docs were removed, say they existed at `<sha>` rather than guessing content.

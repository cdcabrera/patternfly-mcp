---
name: commit-breakout-loop
description: >-
  Delivers a feature as an ordered series of scoped commits—plan first, then per
  commit implement, install npm deps, verify, review-fix, and check in before
  the next slice. Use when the user wants a commit breakout plan, iterative
  scoped commits, feature delivery loop, or fully tested work aligned to repo
  style.
---

# Commit breakout loop

Deliver one feature as **ordered, scoped commits**. Each commit is implemented, verified, reviewed, and checked in before the next slice starts.

## Hard rules

- **Plan before code**: No implementation commits until the user approves the breakout plan (titles + scope per commit).
- **One commit at a time**: Stay inside the **current** commit’s scope. Do not pull in later-slice work.
- **Git safety**: Follow the user’s commit rules—never update git config, no destructive git without explicit approval, no push unless asked, no `--no-verify` unless asked.
- **Commits only when authorized**: After a slice passes verification and review, **propose** the commit (message + file list). Create the commit only when the user confirms (or their message explicitly authorizes checking in that slice).
- **Prove verification**: Do not claim tests or lint passed without command output.
- **Minimal diffs**: Match existing naming, types, imports, and patterns in touched files.
- **Fix budget**: At most **10 fixes** per commit slice in the review–verify loop (see Step E). When the cap is hit, stop fixing and move to **Step F** with remaining items documented.

## Phase 1 — Breakout plan

1. Clarify the feature goal and acceptance criteria if missing.
2. Inspect the repo (`package.json` scripts, CI, lint, test layout, recent `git log` style).
3. Propose an **ordered** commit list. For each entry include:
   - **Title** (imperative, matches repo commit tone)
   - **Scope**: files/areas, behavior added or changed
   - **Dependencies**: which prior commits this builds on
   - **Verification**: which commands must pass before check-in
4. Optional: Mermaid diagram when order or dependencies are non-obvious.
5. **Stop and get user approval** before Phase 2.

### Plan template

```markdown
## Commit breakout plan

**Feature**: [one line]
**Branch**: [suggested name or current]

| # | Commit title | Scope | Depends on | Verification |
|---|--------------|-------|------------|--------------|
| 1 | ... | ... | — | ... |
| 2 | ... | ... | 1 | ... |

**Out of scope for this feature**: ...
**Open questions**: ...
```

Track progress for the whole run:

```
Feature progress:
- [ ] Plan approved
- [ ] Commit 1/N: [title]
- [ ] Commit 2/N: [title]
...
- [ ] Feature acceptance (end-to-end)
```

## Phase 2 — Per-commit loop

Repeat for **each** approved commit, in order.

### Step A — Start slice

- Announce commit number, title, and scope.
- Reset **fix count** for this slice to `0/10`.
- Re-read conventions in files you will touch (not the whole repo).

### Step B — Dependencies

- If the slice needs new npm packages: `npm install` the package(s), keep dev vs prod aligned with repo usage.
- Do not bump unrelated dependencies.

### Step C — Implement

- Implement **only** this commit’s scope.
- Add or update tests that prove the slice’s behavior (unit/integration as the repo expects).

### Step D — Verify

Discover commands from `package.json`, `Makefile`, and CI workflows. Run every category that exists:

| Category | Run when present |
|----------|------------------|
| Unit tests | Always |
| Lint | Always |
| Types | Always |
| Spell | Always |
| Integration / e2e | When slice touches paths those suites cover, or plan says so |
| Build | Before e2e when `dist/` must be fresh |

**PatternFly MCP** (this repo): prefer `npm test`; add `npm run test:integration` when behavior affects the built server or e2e paths.

Fix verification failures inside the **fix budget** (each corrective change after a failed verify or review counts as one fix; increment the slice counter). Re-run the **narrowest** command that failed, then the slice’s planned verification set.

When verification is green, enter **Step E**. When the fix budget is exhausted mid-slice, skip further Step D/E cycles and go to **Step F**.

### Step E — Review loop

Goal: no blocking issues in **this slice’s diff** (staged + unstaged for the slice), within the **fix budget**.

**Fix budget (required)**

- Track `fixes: N/10` for the **current commit slice** only (reset in Step A).
- **Counts as one fix**: any code or test change during **Steps D–E** to address a failed verification run or a review finding (any severity).
- **Does not count**: re-running commands, read-only review, staging, or commit message edits.

1. Self-review: diff against parent, trace non-trivial call paths, check edge cases and error handling.
2. Optional deep review: apply the **code-review** skill to **uncommitted slice changes** or the slice’s commit range only.
3. Optional Bugbot-style pass: apply **review-bugbot** when the user wants automated review; fix **Critical/High** findings in scope when budget allows.
4. For PatternFly **React** UI repos, run the **coding-standards** subagent on the slice when available.

**Review loop exit** (any of):

- Verification green **and** no unfixed Critical/High findings in slice scope → **Step F**.
- Medium/Low only: fix within budget, or list and ask whether to proceed → **Step F** when resolved or user confirms.
- **`fixes` reaches 10** → **Step F** immediately. Report: verification status, unfixed findings (severity + location), and what was deferred.

If review finds issues and `fixes < 10` → implement fixes (increment counter) → return to **Step D**, then **Step E** again.

### Step F — Propose check-in

Present:

- **Fix budget**: `N/10` used for this slice
- Suggested commit message (1–2 sentences, why-focused; match repo style)
- Files to stage (explicit paths; no `git add .` unless the user’s rules allow it for this repo)
- Verification summary (commands + pass/fail)
- **Deferred** (if cap hit or known gaps): bullet list with severity; recommend follow-up commit or plan amendment

Wait for user confirmation to commit. If verification is still red or Critical/High remain unfixed, say so explicitly and let the user decide whether to commit, extend the budget, or amend the plan.

### Step G — Commit

When authorized:

1. `git status`, `git diff`, `git log -1` (parallel) per user commit protocol.
2. Stage only planned files.
3. Commit with HEREDoc message.
4. If a hook fails, fix and **new** commit—do not amend unless user rules allow.

Mark this commit done in the progress checklist. **Start Step A** for the next commit.

## Phase 3 — Feature complete

After the last commit:

1. Run the **broadest** verification the plan listed (often full CI-equivalent script).
2. Confirm acceptance criteria from Phase 1.
3. Report: commits landed (SHAs or titles), commands run, anything deferred.

Do not open a PR or push unless the user asks.

## Commit message hints

- Match recent `git log` on the branch (prefix style, tense, length).
- One commit = one logical slice; message explains **why** the slice exists in the sequence.

## When to stop and ask

- Plan ambiguity or conflicting acceptance criteria
- Scope creep needed to make a slice testable
- Security, auth, migrations, or breaking API changes not in the plan
- Review finding that requires a **prior** commit to be reworked (propose plan amendment first)

## Additional resources

- Commit plan examples and amendment patterns: [examples.md](examples.md)

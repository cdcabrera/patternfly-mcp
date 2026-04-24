---
name: agentready-repo-alignment
description: >-
  Classifies a repository into one of five pass/fail archetypes (generic,
  Markdown docs, React monorepo, React app, Node.js service), verifies the
  bundled checklist exists, audits against human criteria (no weighted
  scores), and writes a root-level Markdown report with missing/found tables
  and remediation-style sections. Use when the user says agentready, agent
  ready, or asks for an agent-readiness / contributor-readiness checklist audit
  or alignment report for any codebase.
---

# AgentReady-style checklist alignment (human pass/fail)

This skill is **self-contained**: criteria live in **[checklists.md](checklists.md)** beside this file. It is **influenced by** the themes behind [ambient-code/agentready](https://github.com/ambient-code/agentready) but does **not** run that tool or copy its scoring model.

## Workflow

1. **Read** [checklists.md](checklists.md) and skim [reference.md](reference.md) for the separation-of-concerns automation caveat.
2. **Classify** the repository into exactly one archetype **§1–§5** using evidence (file layout, manifests, CI). Optionally run **`scripts/detect_repo_archetype.sh`** from the **target repo root** and treat its output as a hint, not ground truth.
3. **Confirm checklist exists** — `checklists.md` must contain a `## N.` section for that archetype. If the skill directory is incomplete (missing section), **stop** and explain what is broken. Do **not** invent new rows at audit time.
4. **If classification is ambiguous** — pick the **most specific** matching section if evidence is strong; otherwise default to **§1 Generic**, state the assumption, and list what would change the classification.
5. **Audit** — For each applicable row: **Pass**, **Fail**, or **N/A** (with one-line justification). Cite paths, workflow names, or commands. Avoid content-free passes.
6. **Optional score** — `passes ÷ (passes + fails)` over applicable rows only (exclude N/A).
7. **Write report** — Create a Markdown file at the **root of the repository being audited** using the template below. Filename: `agentready-checklist-report-YYYY-MM-DD.md` (use the authoritative calendar date from the session).

## Report template (AgentReady-inspired Markdown)

Mirror the *shape* of a typical AgentReady Markdown export (title, metadata, summary, priority block, detailed findings). **Do not** fabricate numeric “AgentReady scores” or tiers; this report is **human checklist only**.

```markdown
# AgentReady-style checklist alignment report

**Repository**: [name or folder]
**Path**: `[absolute path to repo root]`
**Branch / commit**: [if available, else “unknown”]
**Generated**: [ISO-like human date]
**Checklist archetype**: §[N] — [title from checklists.md]
**Skill**: human pass/fail rows (not automated AgentReady scoring)

---

## Summary

| Metric | Value |
|--------|-------|
| **Applicable rows** | [n] |
| **Pass** | [n] |
| **Fail** | [n] |
| **N/A** | [n] |
| **Pass rate (optional)** | [passes ÷ (passes + fails)] |

### Classification rationale

- [Bullet signals: e.g. workspaces, frameworks, CI paths]

---

## Checklist matrix

| Row | Status | Check (short) | Evidence |
|-----|--------|---------------|----------|
| 1 | Pass / Fail / N/A | … | Path or observation |

---

## Priority improvements

Ordered **Fail** rows (highest impact first—readme, agent context, lockfile, CI, tests, security hygiene, then stack-specific gaps). One bullet per row with **concrete** next files or edits.

---

## Detailed findings

### Row [n]: [short title]

**Status:** Pass / Fail / N/A  
**Measured against:** [quote or paraphrase the checklist cell]  
**Evidence:**
- …

**Remediation:**
1. …

**Suggested files / updates:** [explicit list]

---
```

Repeat **Detailed findings** for every **Fail** (and optionally every **Pass** if the user asked for exhaustive output—default to **Fail + N/A with risk** only to save space).

## Data facets the report should surface

When a row **Fails** or is **N/A with a gap**, call out:

- **Files to add or extend** (e.g. `README.md`, `AGENTS.md`, `.github/workflows/*.yml`, `.env.example`, lockfile).
- **CI / automation** (workflows, Dependabot config, pre-commit).
- **Documentation** (commands, architecture notes, ADR location).
- **Structure** (workspace boundaries, API layer folder, health endpoints).
- **Hygiene** (`.gitignore` patterns, secret scanning posture).

## Boundaries

- No weighted scores; no DBT-only or vendor research claims.
- Do **not** treat automated `separation_of_concerns` metrics as equivalent to §1 rows 11–13 (see [reference.md](reference.md)).
- Extend criteria by editing **checklists.md** only; if scope changes, update this skill’s YAML **description**.

## Additional resources

- Criteria tables: [checklists.md](checklists.md)
- Influences, optional attribute mapping, caveats: [reference.md](reference.md)
- Full report example: [examples.md](examples.md)
- Optional classifier hint: [scripts/detect_repo_archetype.sh](scripts/detect_repo_archetype.sh)

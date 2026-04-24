# repo-readiness-checklists (portable Cursor skill)

Self-contained pass/fail audits for **any** repository. No dependency on a specific product repo or external checklist file.

## Install

**Option A — One project**

Copy this entire folder into the project:

```text
<your-repo>/.cursor/skills/repo-readiness-checklists/
  SKILL.md
  checklists.md
  README.md
```

**Option B — All your machines / every repo (personal skill)**

Copy the same folder to:

```text
~/.cursor/skills/repo-readiness-checklists/
```

Cursor loads skills from `~/.cursor/skills/<name>/` and from `<workspace>/.cursor/skills/<name>/`.

## Contents

| File | Purpose |
|------|---------|
| `SKILL.md` | Agent instructions, workflow, when to apply |
| `checklists.md` | All five archetype tables + separation-of-concerns notes |
| `README.md` | This install note |

## Customize

Edit **`checklists.md`** only (add rows, change wording). Keep **`SKILL.md`** description accurate if you change scope.

## Versioning

Fork or vendor this directory into your org’s template repo if you want a golden copy; there is no package manager for skills today.

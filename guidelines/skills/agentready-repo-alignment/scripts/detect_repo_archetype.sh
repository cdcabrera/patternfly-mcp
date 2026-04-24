#!/usr/bin/env sh
# Optional heuristic: suggest checklist section §1–§5 from repo root signals.
# Run from the repository under audit: `sh path/to/detect_repo_archetype.sh`
# Output: human-readable lines (not JSON) for easy reading in terminals without jq.

set -euf

ROOT="${1:-.}"
cd "$ROOT" 2>/dev/null || {
  echo "error: cannot cd to $ROOT" >&2
  exit 1
}

has_file() { test -f "$1"; }
has_dir() { test -d "$1"; }

REACT=0
NODE=0
WORKSPACE=0
DOCS=0

has_file package.json && NODE=1

if has_file package.json && command -v node >/dev/null 2>&1; then
  if node -e "const p=require('./package.json'); const w=p.workspaces; process.exit(Array.isArray(w)||typeof w==='object'?0:1);" 2>/dev/null; then
    WORKSPACE=1
  fi
fi

has_file pnpm-workspace.yaml && WORKSPACE=1

if has_file package.json && command -v node >/dev/null 2>&1; then
  if node -e "const p=require('./package.json'); const d=JSON.stringify(p.dependencies||{})+JSON.stringify(p.devDependencies||{}); process.exit(/\"react\"/.test(d)?0:1);" 2>/dev/null; then
    REACT=1
  fi
fi

# Doc *site* markers only (a plain docs/ folder exists in many code repos).
if has_file mkdocs.yml \
  || has_file mkdocs.yaml \
  || has_file docusaurus.config.js \
  || has_file docusaurus.config.mjs \
  || has_file docusaurus.config.ts \
  || has_file vitepress.config.ts \
  || has_file vitepress.config.mjs \
  || has_file vitepress.config.js \
  || has_file docs/.vitepress/config.ts \
  || has_file docs/.vitepress/config.js; then
  DOCS=1
fi

# Node service heuristics (coarse)
SERVER=0
if has_file package.json && command -v node >/dev/null 2>&1; then
  if node -e "const p=require('./package.json'); const d=JSON.stringify(p.dependencies||{})+JSON.stringify(p.devDependencies||{}); process.exit(/express|fastify|koa|@nestjs|h3|polka|\"connect\"/.test(d)?0:1);" 2>/dev/null; then
    SERVER=1
  fi
fi

echo "signals: ROOT=$ROOT"
echo "  package.json: $([ "$NODE" -eq 1 ] && echo yes || echo no)"
echo "  workspace (package.json workspaces or pnpm-workspace.yaml): $([ "$WORKSPACE" -eq 1 ] && echo yes || echo no)"
echo "  react dependency: $([ "$REACT" -eq 1 ] && echo yes || echo no)"
echo "  server dependency hint: $([ "$SERVER" -eq 1 ] && echo yes || echo no)"
echo "  doc site generator configs (mkdocs, docusaurus, vitepress): $([ "$DOCS" -eq 1 ] && echo yes || echo no)"

SUGGEST=1
REASON="default generic catch-all"

if [ "$WORKSPACE" -eq 1 ] && [ "$REACT" -eq 1 ]; then
  SUGGEST=3
  REASON="workspace + react → React monorepo (§3)"
elif [ "$REACT" -eq 1 ] && [ "$WORKSPACE" -eq 0 ]; then
  SUGGEST=4
  REASON="react without workspace → React app (§4)"
elif [ "$SERVER" -eq 1 ] && [ "$REACT" -eq 0 ]; then
  SUGGEST=5
  REASON="server-style deps without react → Node.js service (§5)"
elif [ "$DOCS" -eq 1 ] && [ "$NODE" -eq 0 ]; then
  SUGGEST=2
  REASON="doc site generator without package.json → documentation repo (§2)"
elif [ "$DOCS" -eq 1 ] && [ "$NODE" -eq 1 ] && [ "$REACT" -eq 0 ] && [ "$WORKSPACE" -eq 0 ] && [ "$SERVER" -eq 0 ]; then
  SUGGEST=2
  REASON="doc site generator + node without react/workspace/server deps → likely documentation repo (§2); verify"
fi

echo "suggested_section: $SUGGEST"
echo "suggested_label: $REASON"
echo "note: confirm with file layout and CI; script is advisory only."

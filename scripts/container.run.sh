#!/usr/bin/env bash
# Run the PatternFly MCP container as a stdio MCP server.
# All arguments are forwarded verbatim to the CLI inside the container.
#
# Usage:
#   ./scripts/container.run.sh [-- <cli flags>]
#   IMAGE=localhost/patternfly-mcp:latest ./scripts/container.run.sh --verbose --log-stderr
#
# `-i` (interactive stdin) is REQUIRED for stdio MCP. Do NOT add `-t`.
#
#
# main()
#
{
  # Fail fast
  set -euo pipefail

  IMAGE="${IMAGE:-localhost/patternfly-mcp:latest}"
  ENGINE=""

  if [ "$(command -v podman)" ]; then
    ENGINE="podman"
  elif [ "$(command -v docker)" ]; then
    ENGINE="docker"
  else
    echo 'Error: Podman and Docker not found.' >&2
    exit 1
  fi

  echo "Using $ENGINE...";

  exec "$ENGINE" run --rm -i \
    --userns=keep-id \
    --security-opt=no-new-privileges \
    --cap-drop=ALL \
    --read-only \
    --tmpfs /tmp:rw,size=64m \
    "${IMAGE}" "$@"
}

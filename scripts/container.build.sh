#!/usr/bin/env bash
# Build the PatternFly MCP container image locally with podman.
#
# Usage:
#   ./scripts/container.build.sh
#   IMAGE=localhost/patternfly-mcp ./scripts/container.build.sh
#
# main()
#
{
  set -euo pipefail

  VERSION="$(node -p "require('./package.json').version")"
  SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
  IMAGE="${IMAGE:-localhost/patternfly-mcp}"
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

  "$ENGINE" build \
    --file Containerfile \
    --tag "${IMAGE}:${VERSION}" \
    --tag "${IMAGE}:${VERSION}-node24" \
    --tag "${IMAGE}:sha-${SHA}" \
    --tag "${IMAGE}:latest" \
    .

  echo
  echo "Built tags:"
  echo "  ${IMAGE}:${VERSION}"
  echo "  ${IMAGE}:${VERSION}-node24"
  echo "  ${IMAGE}:sha-${SHA}"
  echo "  ${IMAGE}:latest"
}

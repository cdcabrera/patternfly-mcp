#
# PatternFly MCP server
#
# ---- Stage 1: builder ---------------------------------------------------
FROM registry.access.redhat.com/ubi9/nodejs-24-minimal:latest AS builder

# Define  user ID
ARG CONTAINER_UID=1001
ENV CONTAINER_UID=${CONTAINER_UID}

# Predefiend UBI app directory
WORKDIR ${APP_ROOT}

# Copy sources required by pkgroll
COPY --chown=${CONTAINER_UID}:0 package.json package-lock.json tsconfig.json ./

USER ${CONTAINER_UID}

# Install
RUN npm ci --ignore-scripts --no-audit --no-fund

# Copy source, compile the bundle directly with pkgroll, strip dev deps
COPY --chown=${CONTAINER_UID}:0 src ./src
RUN npx --no-install pkgroll --minify \
 && npm prune --omit=dev --ignore-scripts

# ---- Stage 2: runtime ---------------------------------------------------
FROM registry.access.redhat.com/ubi9/nodejs-24-minimal:latest AS runtime

LABEL org.opencontainers.image.title="patternfly-mcp" \
      org.opencontainers.image.description="PatternFly documentation MCP server (Node.js 24)" \
      org.opencontainers.image.source="https://github.com/patternfly/patternfly-mcp" \
      org.opencontainers.image.url="https://github.com/patternfly/patternfly-mcp" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Red Hat" \
      io.modelcontextprotocol.transport="stdio"

ARG CONTAINER_UID=1001
ENV CONTAINER_UID=${CONTAINER_UID}

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NO_COLOR=1

WORKDIR ${APP_ROOT}

# Runtime payload only.
COPY --from=builder --chown=${CONTAINER_UID}:0 ${APP_ROOT}/package.json   ${APP_ROOT}/package.json
COPY --from=builder --chown=${CONTAINER_UID}:0 ${APP_ROOT}/node_modules   ${APP_ROOT}/node_modules
COPY --from=builder --chown=${CONTAINER_UID}:0 ${APP_ROOT}/dist           ${APP_ROOT}/dist

USER ${CONTAINER_UID}

# stdio MCP server. Clients attach via stdin/stdout. `CMD` provides only a
# default flag; `podman run ... <image> <flags>` replaces it entirely, so
# every CLI option works without rebuilding the image.
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--log-stderr"]

# Declarative Configuration (Spec)

To support complex, version-controlled server setups, the PatternFly MCP server is transitioning towards a declarative configuration model using YAML or Markdown.

## Proposed Schema (`pf-mcp.config.yaml`)
```yaml
server:
  name: "custom-patternfly-server"
  port: 8080
  transport: "http"

plugins:
  - name: "community-charts"
    source: "npm:@patternfly/mcp-charts-plugin"
    options:
      theme: "dark"
  - name: "local-utilities"
    source: "./plugins/my-utils.ts"

resources:
  - prefix: "custom-docs://"
    resolver: "./resolvers/custom-docs.js"
```

## Benefits
- **Reproducibility**: Shared server configurations across development teams.
- **Plugin Management**: Centralized registration of external tools, resources, and prompts.
- **Version Control**: Configuration resides in the repository alongside the code that uses it.

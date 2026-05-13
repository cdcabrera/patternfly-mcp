# Security

## Reporting a Vulnerability

If you discover a security vulnerability in this repository, please report it responsibly.

**Do not open a public issue for security vulnerabilities.**

- **GitHub:** Use [private vulnerability reporting](https://github.com/patternfly/patternfly-mcp/security/advisories/new)

## Scope

Security concerns for this MCP server include:
- **Data Integrity:** Ensuring PatternFly documentation and schemas are accurate and untampered.
- **Execution Safety:** Preventing malicious code execution through custom tool plugins.
- **Path Escape:** Ensuring the server cannot be used to read sensitive files on the host system via validated path resolution.

## Contribution Guardrails

To maintain codebase integrity, we use an automated **Gatekeeper** workflow:
- PRs from non-core contributors that modify core behavior or exceed established file limits are automatically placed on **Policy Hold**.
- If automation is unresolved, these PRs require a secondary review by a Maintainer to be promoted from Policy Hold status.

> **Note**: Automated labeling and commenting may be restricted for pull requests from forks. In these cases, refer to the **GitHub Actions Job Summary** for policy guidance and status.

## Release Integrity

- **Code Freeze:** During the pre-release window, the repository enters a restricted state where only critical security patches are merged.
- **Provenance:** All official releases are published using `npm publish --provenance` to provide a verifiable link between the package and the GitHub Actions build.

## How Contributions Are Reviewed

See [GOVERNANCE.md](GOVERNANCE.md) for the review layers that every contribution passes through before it can affect a user's system.

## Supported Versions

Only the latest semver major version on the `main` branch is supported.

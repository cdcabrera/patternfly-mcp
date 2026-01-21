# Agent Behaviors

## Overview

Comprehensive guide to agent behaviors, workflows, and standards for the codebase.

## For Agents

### Processing Priority

Critical - Process first when working with the repository.

### Related Guidelines

See the [Guidelines Index](./README.md#guidelines-index) for all guidelines.

### Key Concepts

- Repository context and structure
- Core behavior standards
- Trigger-based workflows
- Decision-making principles
- Guidance authoring standards

## 1. Repository Context

The PatternFly MCP server is a Model Context Protocol (MCP) server written in TypeScript. It provides access to PatternFly documentation, rules, and component schemas for LLMs.

### Key Architectural Components

For a detailed overview of the system design and roadmap, see [docs/architecture.md](../docs/architecture.md).

- **Core Server**: Manages the MCP lifecycle and transport (stdio/http).
- **Tools**: Built-in actions for searching and using PatternFly documentation and technical specifications.
- **Resources**: URI-based access to PatternFly context, documentation, and schemas.
- **External Tools Host**: Isolated execution environment for custom tool plugins.
- **Caching & Performance**: Robust memoization and concurrency systems for efficient resource retrieval.

## 2. Core Behavior Standards

- **Sequential Processing**: Ask questions one at a time; process requests in logical order; complete one task before starting another.
- **Architectural Alignment**: Always confirm changes against the [system architecture and roadmap](../docs/architecture.md) before proceeding with implementation.
- **Reference-Based Implementation**: Review git history; study existing patterns (e.g., "creator" pattern for tools/resources); maintain code style consistency and follow [standard Git workflows](../CONTRIBUTING.md#using-git).
- **Validation Required**: Follow checklists; verify requirements; test thoroughly; validate against PatternFly v6 standards. Review [pull request warning signs](../CONTRIBUTING.md#pull-requests) to avoid common pitfalls.
- **Confirmation Required**: Confirm success; summarize changes; explain impact; verify understanding.
- **Environment Awareness**: 
  - Server execution requires **Node.js >= 20**.
  - External tool plugins (`--tool`) require **Node.js >= 22**.
  - Always verify environment compatibility when proposing tools using modern Node.js features.
- **Security Context**:
  - Default to `--plugin-isolation strict`.
  - If a tool requires filesystem or network access beyond the sandbox, document the need for `--plugin-isolation none` explicitly.
  - Warn users when a proposed solution requires disabling isolation.
- **State Management**: Use `.agent/` directory for local guidance and state; maintain context; preserve session information.
- **Security Awareness**: Be mindful of path traversal and isolation levels when working with external tools and resource loading.

## 3. Trigger-Based Workflows

### Trigger: "Research MCP SDK methods or issues"

1. **Analyze**
  - Confirm the installed MCP SDK version
  - Research the error
  - Identify conflict scenarios with code
  - Identify potential test cases

2. **Test**
  - Run typing, lint, unit and e2e tests
  - Confirm conflicts
  - Test resolution options

3. **Resolve**
  - Adjust codebase
  - Change code or confirm a solution
  - Implement resolution

4. **Validate**
  - Test conflict resolution
  - Confirm approach

## 4. Decision-Making Guidelines

1. **Consistency vs. Improvement**
  - Favor consistency for minor changes
  - Favor improvement for bugs and features
  - Balance both when possible

2. **Strictness vs. Flexibility**
  - Strict for quality/security
  - Flexible for style preferences
  - Consider developer experience

3. **Backward Compatibility**
  - Minimize breaking changes
  - Document when necessary

4. **Architectural Alignment**
  - Always verify that the proposed solution fits within the project's [long-term architecture and roadmap](../docs/architecture.md).
  - Consult the roadmap before introducing major features or structural changes.

## 5. Validation Procedures

For all workflows:

1. **Testing**: Run appropriate tests, ensure passing, update snapshots only when intentional
2. **Documentation**: Verify accuracy, consistency, and helpful examples
3. **Code Quality**: Follow patterns, check edge cases, ensure clear comments

## Date and Time Management

Run `$ date` to get system date before applying dates. Used for:
- Updating timestamps in documentation
- Adding creation dates
- Recording when changes were made

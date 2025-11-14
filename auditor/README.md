# PatternFly MCP Auditor

Containerized consistency auditor for the PatternFly MCP server.

## Overview

The auditor runs consistency tests against the PatternFly MCP server using an embedded model (node-llama-cpp). It evaluates both baseline questions and PatternFly-specific tooling questions to determine consistency across multiple runs.

## Status

🚧 **Implementation in Progress** - Core functionality being developed.

## Architecture

See [.agent/auditor-plan/PLAN.md](../.agent/auditor-plan/PLAN.md) for complete implementation plan and architecture.

## Quick Start

### Prerequisites

- Node.js 20.0.0 or higher
- PatternFly MCP server running in HTTP mode
- npm workspace (configured in root package.json)

### Installation

```bash
# From project root
npm install
```

### Configuration

Edit `config/audit-config.yaml` to configure:
- MCP server URL
- Number of audit runs
- Question sets
- Model settings
- Report formats

### Run Auditor

**From root directory (recommended):**

**Local execution:**
```bash
# Option 1: Manual MCP management
npm run auditor:mcp:start  # Start MCP server first
npm run auditor            # Run audit
npm run auditor:mcp:stop   # Stop MCP server when done

# Option 2: Convenience wrapper (auto-starts/stops MCP)
npm run auditor:with-mcp           # Start MCP, run audit, stop MCP
npm run auditor:with-mcp:quick     # Quick audit (3 runs)
npm run auditor:with-mcp:full       # Full audit (10 runs)

# Option 3: Run auditor (assumes MCP already running)
npm run auditor
npm run auditor:quick
npm run auditor:full
npm run auditor:custom -- --mcp-url http://localhost:3000 --runs 5
```

**MCP server management:**
```bash
npm run auditor:mcp:start   # Start MCP server in HTTP mode
npm run auditor:mcp:stop    # Stop MCP server
npm run auditor:mcp:status  # Check if MCP server is running
```

**Containerized execution:**
```bash
# Build container (first time only)
npm run auditor:build

# Option 1: Convenience scripts (auto-starts/stops MCP)
npm run auditor:start           # Start MCP, run containerized audit, stop MCP
npm run auditor:start:quick     # Quick audit (3 runs) with auto MCP management
npm run auditor:start:full      # Full audit (10 runs) with auto MCP management

# Option 2: Manual MCP management
npm run auditor:mcp:start       # Start MCP server first
npm run auditor:container       # Run containerized audit
npm run auditor:mcp:stop        # Stop MCP server when done

# Option 3: Run containerized auditor (assumes MCP already running)
npm run auditor:container
npm run auditor:container:quick
npm run auditor:container:full

# Custom options
# Note: On macOS, use host.containers.internal instead of localhost
npm run auditor:container:custom -- --mcp-url http://host.containers.internal:3000 --runs 5
```

**From auditor directory:**
```bash
# Using npm workspace
npm run audit

# Or directly
node src/index.js --mcp-url http://localhost:3000 --runs 10
```

### CLI Options

```bash
node src/index.js [options]

Options:
  --config <path>      Path to audit configuration YAML
  --mcp-url <url>      MCP server URL (overrides config)
  --runs <number>      Number of audit runs (overrides config)
  --output <dir>       Output directory for reports
  --format <formats>   Comma-separated formats: markdown,table,json,yaml
  --help, -h           Show help message
```

## Directory Structure

```
auditor/
├── config/
│   └── audit-config.yaml      # Default configuration
├── questions/
│   ├── baseline-default.yaml  # Default baseline questions
│   └── pf-mcp-default.yaml    # Default PF-MCP questions
├── src/
│   ├── index.js               # Main entry point
│   ├── auditor.js             # Core audit logic
│   └── reporter.js            # Report generation
└── reports/                   # Generated reports (gitignored)
```

## Features

- ✅ Question shuffling with random PF-MCP interjection
- ✅ Health checks (server accessibility, tool registration)
- ✅ Consistency analysis (tool calls, answers, timing)
- ✅ Multiple report formats (markdown, table, JSON, YAML)
- ✅ Configurable question sets
- ✅ Model integration (node-llama-cpp with fallback to mock)
- ✅ Containerization (Containerfile ready)

## Development

### Current Status

- ✅ Directory structure created
- ✅ npm workspace configured
- ✅ Configuration system
- ✅ Question loading and shuffling
- ✅ Health checks
- ✅ MCP client (HTTP)
- ✅ Consistency analysis
- ✅ Report generation
- ✅ Model integration (node-llama-cpp with mock fallback)
- ✅ Containerization (Containerfile ready)

### Next Steps

1. Download model (see [MODEL-SETUP.md](./MODEL-SETUP.md))
2. Test with real MCP server
3. Build and test container
4. Optimize image size (<900MB target)

## Documentation

- **[.agent/auditor-plan/PLAN.md](../.agent/auditor-plan/PLAN.md)** - Complete implementation plan
- **[.agent/auditor-plan/README.md](../.agent/auditor-plan/README.md)** - Planning documentation
- **[MODEL-SETUP.md](./MODEL-SETUP.md)** - Model download and setup guide

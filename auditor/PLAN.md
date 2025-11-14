# Containerized Auditor for PatternFly MCP - Implementation Plan

**Date**: 2025-11-13  
**Status**: Planning Phase

## Overview

Design and implement a containerized auditor that runs consistency tests against the PatternFly MCP server using an embedded model (node-llama-cpp). The auditor will evaluate both baseline questions and PatternFly-specific tooling questions to determine consistency across multiple runs.

## Core Concepts

### Consistency vs Accuracy Testing

Based on `.agent/accuracy-testing/` approach:

- **Consistency**: Test that the MCP server tools work reliably and produce consistent outputs
- **Accuracy**: Not tested (too subjective, context-dependent)
- **Focus**: Tool execution reliability, output format consistency, error handling

### Audit Process

1. **Health Checks**: Predefined checks against current codebase state
2. **Question Sets**:
   - **Baseline Questions** (min 5): Generic questions unrelated to PatternFly MCP
   - **PF-MCP Questions** (min 3): Embedded questions about PatternFly MCP tooling methods
3. **Random Interjection**: PF-MCP questions randomly interjected into baseline questions
4. **Consistency Analysis**: Compare responses across multiple runs
5. **Report Generation**: Markdown, markdown table, JSON/YAML output

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                  Container (Podman)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Auditor Application                      │  │
│  │  ┌──────────────┐  ┌──────────────┐            │  │
│  │  │   Config     │  │   Model      │            │  │
│  │  │   Loader     │  │   Manager    │            │  │
│  │  └──────────────┘  └──────────────┘            │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │         Audit Runner                      │  │  │
│  │  │  • Question Shuffler                      │  │  │
│  │  │  • MCP Client                             │  │  │
│  │  │  • Model Interface                        │  │  │
│  │  │  • Consistency Analyzer                  │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │         Report Generator                  │  │  │
│  │  │  • Markdown Report                       │  │  │
│  │  │  • Markdown Table                        │  │  │
│  │  │  • JSON/YAML Export                     │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Embedded Model (node-llama-cpp)          │  │
│  │  • Small model (<300MB)                         │  │
│  │  • Balanced performance                        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Volume Mounts                           │  │
│  │  • /workspace/patternfly-mcp (codebase)         │  │
│  │  • /workspace/model (optional, future)          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTP
                          ▼
              ┌───────────────────────┐
              │   PatternFly MCP      │
              │   Server (HTTP mode)  │
              └───────────────────────┘
```

## File Structure

### Directory Layout

```
auditor/
├── PLAN.md                    # This file
├── README.md                   # Usage and setup guide
├── package.json                # npm workspace package
├── Containerfile               # Podman container definition
├── .dockerignore               # Container ignore patterns
│
├── config/
│   └── audit-config.yaml       # Default audit configuration
│
├── src/                        # Source code (JS or TS)
│   ├── index.js               # Main entry point
│   ├── auditor.js             # Core audit logic
│   └── reporter.js            # Report generation
│
├── questions/
│   ├── baseline-default.yaml  # Default baseline questions
│   └── pf-mcp-default.yaml    # Default PF-MCP questions
│
└── reports/                    # Generated reports (gitignored)
    └── .gitkeep
```

### Implementation Decision: JS vs TypeScript

**Decision Criteria:**
- **3 files max**: Use JavaScript (simpler, no build step)
- **Complex tracking**: Use TypeScript (better maintainability, matches MCP codebase style)

**Recommendation**: Start with **JavaScript** (3 files), migrate to TypeScript if complexity grows.

**Files:**
1. `index.js` - Entry point, CLI argument parsing, orchestration
2. `auditor.js` - Core audit logic (question shuffling, MCP client, model interface, consistency analysis)
3. `reporter.js` - Report generation (markdown, tables, JSON/YAML)

## Configuration

### YAML Configuration Structure

```yaml
# config/audit-config.yaml
audit:
  runs: 5                    # Number of audit runs
  timeout: 30000             # Per-question timeout (ms)
  
mcp:
  url: "http://localhost:3000"  # MCP server URL (HTTP mode)
  timeout: 10000             # MCP request timeout (ms)

model:
  path: null                 # null = use embedded, path = custom model
  temperature: 0.7           # Model temperature
  maxTokens: 512             # Max response tokens

questions:
  baseline:
    - id: "baseline-1"
      prompt: "What is the capital of France?"
      category: "general"
    - id: "baseline-2"
      prompt: "Explain quantum computing in simple terms."
      category: "science"
    # ... more baseline questions
  
  pf-mcp:
    - id: "pf-mcp-1"
      prompt: "What tools are available in the PatternFly MCP server?"
      category: "tooling"
      expectedTool: "usePatternFlyDocs"
    - id: "pf-mcp-2"
      prompt: "How do I fetch PatternFly component documentation?"
      category: "tooling"
      expectedTool: "fetchDocs"
    # ... more PF-MCP questions

interjection:
  strategy: "random"         # "random" | "even" | "weighted"
  ratio: 0.3                # Ratio of PF-MCP to baseline (if weighted)

healthChecks:
  - name: "server-accessible"
    type: "http"
    endpoint: "/health"
  - name: "tools-registered"
    type: "mcp"
    tool: "usePatternFlyDocs"

reporting:
  formats: ["markdown", "json"]  # "markdown" | "table" | "json" | "yaml"
  outputDir: "./reports"
  filename: "audit-{timestamp}"
```

### Default Questions

#### Baseline Questions (5 minimum)

Embedded in code as fallback, configurable via YAML:

1. "What is the capital of France?"
2. "Explain the concept of recursion in programming."
3. "What are the three laws of thermodynamics?"
4. "Describe the difference between HTTP and HTTPS."
5. "What is the purpose of version control systems?"

#### PF-MCP Questions (3 minimum)

Embedded in code as fallback, configurable via YAML:

1. "What tools are available in the PatternFly MCP server? List all available tools."
2. "How do I use the usePatternFlyDocs tool to fetch PatternFly documentation?"
3. "What is the componentSchemas tool and how do I use it to get component prop definitions?"

## Implementation Details

### 1. Main Entry Point (`index.js`)

**Responsibilities:**
- Parse CLI arguments
- Load configuration (YAML + defaults)
- Initialize model (node-llama-cpp)
- Start MCP server connection check
- Run audit
- Generate reports
- Exit with appropriate code

**CLI Arguments:**
```bash
node index.js \
  --config ./config/audit-config.yaml \
  --mcp-url http://localhost:3000 \
  --runs 5 \
  --output ./reports \
  --format markdown,json
```

### 2. Core Auditor (`auditor.js`)

**Responsibilities:**
- Load and merge question sets (baseline + PF-MCP)
- Shuffle questions with random PF-MCP interjection
- Run health checks
- Execute audit runs:
  - For each question:
    - Send to model via node-llama-cpp
    - Model may call MCP tools
    - Capture tool calls and final answer
    - Record timing and metadata
- Analyze consistency across runs
- Return structured results

**Key Functions:**
```javascript
// Question management
function loadQuestions(config) { }
function shuffleQuestions(baseline, pfMcp, strategy) { }

// Health checks
async function runHealthChecks(config) { }

// Audit execution
async function runAuditRun(runNumber, questions, model, mcpClient) { }

// Consistency analysis
function analyzeConsistency(allResults) { }
```

### 3. Report Generator (`reporter.js`)

**Responsibilities:**
- Generate markdown report
- Generate markdown table
- Generate JSON/YAML export
- Format consistency metrics
- Include health check results

**Report Structure:**
```markdown
# PatternFly MCP Audit Report

**Date**: 2025-11-13T10:30:00Z
**Runs**: 5
**Total Questions**: 12 (7 baseline, 5 PF-MCP)

## Health Checks
✅ Server accessible
✅ Tools registered

## Consistency Analysis

### Overall Results
- **Consistency Score**: 0.85 (85%)
- **Consistent Runs**: 4/5
- **Inconsistent Runs**: 1/5

### Question-Level Analysis

| Question ID | Category | Consistency | Tool Calls | Notes |
|------------|----------|-------------|------------|-------|
| baseline-1 | general  | 1.0 (100%)  | 0          | Perfect consistency |
| pf-mcp-1   | tooling  | 0.8 (80%)   | 1          | Minor variance |

## Detailed Results
[Per-question breakdown]

## Recommendations
[Actionable insights]
```

## Containerization

### Containerfile (Podman)

```containerfile
# Multi-stage build for minimal image size
FROM node:20-slim AS base

# Install system dependencies for node-llama-cpp
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install auditor dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# Copy auditor code
COPY src/ ./src/
COPY config/ ./config/
COPY questions/ ./questions/

# Model download stage (optional - can be volume-mounted)
FROM base AS model
# Model will be downloaded on first run or volume-mounted

# Final stage
FROM base
WORKDIR /app

# Volume mounts (configured at runtime)
# - /workspace/patternfly-mcp: PatternFly MCP codebase
# - /workspace/model: Optional custom model (future)

# Default command
CMD ["node", "src/index.js"]
```

### Image Size Optimization

**Target**: <900MB (ideally <500MB)

**Strategies:**
1. **Multi-stage build**: Remove build dependencies
2. **Small base image**: `node:20-slim` (~200MB)
3. **Model selection**: Small model (<300MB)
4. **Minimal dependencies**: Only production deps
5. **Layer optimization**: Combine RUN commands

**Estimated Sizes:**
- Base image: ~200MB
- Node.js deps: ~50MB
- node-llama-cpp: ~100MB
- Model: ~250MB (target)
- **Total**: ~600MB (well under 900MB target)

### Model Selection

**Requirements:**
- Small (<300MB)
- Balanced performance
- Compatible with node-llama-cpp
- Good for tool-calling scenarios

**Recommended Models:**
1. **Qwen2.5-0.5B** (~300MB) - Good balance
2. **Phi-3-mini** (~200MB) - Very small, decent performance
3. **TinyLlama-1.1B** (~600MB) - Slightly over, but excellent

**Decision**: Start with **Qwen2.5-0.5B** (balanced, meets size requirement)

### Volume Mounts

**Required:**
- `/workspace/patternfly-mcp`: PatternFly MCP codebase (read-only)

**Future (reserved):**
- `/workspace/model`: Custom model override (with compatibility check)

**Containerfile Volume Declaration:**
```containerfile
VOLUME ["/workspace/patternfly-mcp", "/workspace/model"]
```

## npm Workspace Integration

### Root package.json Update

```json
{
  "workspaces": [
    "auditor"
  ]
}
```

### Auditor package.json

```json
{
  "name": "@patternfly/patternfly-mcp-auditor",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.js",
  "dependencies": {
    "node-llama-cpp": "^2.x.x",
    "js-yaml": "^4.x.x",
    "node-fetch": "^3.x.x"
  },
  "scripts": {
    "audit": "node src/index.js",
    "build": "echo 'No build step for JS'",
    "test": "echo 'Tests TBD'"
  }
}
```

## Consistency Analysis Algorithm

### Metrics

1. **Tool Call Consistency**: Do the same tools get called for the same question?
2. **Answer Consistency**: Are answers semantically similar across runs?
3. **Response Time Consistency**: Are response times consistent?
4. **Error Consistency**: Are errors handled consistently?

### Analysis Function

```javascript
function analyzeConsistency(allResults) {
  // Group by question ID
  const byQuestion = groupBy(allResults, 'questionId');
  
  const analysis = {
    overall: {
      consistencyScore: 0,
      consistentRuns: 0,
      inconsistentRuns: 0
    },
    questions: {}
  };
  
  for (const [questionId, runs] of Object.entries(byQuestion)) {
    const questionAnalysis = {
      toolConsistency: analyzeToolCalls(runs),
      answerConsistency: analyzeAnswers(runs),
      timingConsistency: analyzeTiming(runs),
      overallConsistency: 0
    };
    
    // Weighted average
    questionAnalysis.overallConsistency = 
      (questionAnalysis.toolConsistency * 0.4) +
      (questionAnalysis.answerConsistency * 0.4) +
      (questionAnalysis.timingConsistency * 0.2);
    
    analysis.questions[questionId] = questionAnalysis;
  }
  
  // Calculate overall score
  analysis.overall.consistencyScore = 
    Object.values(analysis.questions)
      .reduce((sum, q) => sum + q.overallConsistency, 0) /
    Object.keys(analysis.questions).length;
  
  return analysis;
}
```

## Future Extensibility

### Model Override (Reserved)

**Design:**
- Check for model at `/workspace/model`
- Validate model compatibility (file format, node-llama-cpp compatibility)
- Fallback to embedded model if invalid
- Log model source (embedded vs custom)

**Compatibility Check:**
```javascript
async function validateModel(path) {
  // Check file exists
  // Check file format (GGUF, etc.)
  // Try to load with node-llama-cpp
  // Return { valid: boolean, error?: string }
}
```

### Additional Features (Future)

1. **Custom health checks**: Plugin system for custom checks
2. **Historical comparison**: Compare against previous audit runs
3. **Trend analysis**: Track consistency over time
4. **Alerting**: Notify on consistency degradation
5. **CI/CD integration**: Automated audit runs

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create `auditor/` directory structure
- [ ] Set up npm workspace
- [ ] Create basic `package.json`
- [ ] Implement configuration loader
- [ ] Create default question sets

### Phase 2: Core Auditor
- [ ] Implement question shuffling
- [ ] Implement MCP client (HTTP)
- [ ] Implement model interface (node-llama-cpp)
- [ ] Implement audit run execution
- [ ] Implement consistency analysis

### Phase 3: Reporting
- [ ] Implement markdown report generator
- [ ] Implement markdown table generator
- [ ] Implement JSON/YAML export
- [ ] Add formatting and styling

### Phase 4: Containerization
- [ ] Create Containerfile
- [ ] Optimize image size
- [ ] Test volume mounts
- [ ] Document container usage

### Phase 5: Testing & Refinement
- [ ] Test with real MCP server
- [ ] Validate consistency metrics
- [ ] Optimize performance
- [ ] Document usage

## Dependencies

### Runtime Dependencies
- `node-llama-cpp`: Embedded model runtime
- `js-yaml`: YAML configuration parsing
- `node-fetch`: HTTP client for MCP server

### Development Dependencies
- (TBD based on JS vs TS decision)

## Open Questions

1. **Model download**: Download on first run or include in image?
   - **Recommendation**: Download on first run, cache in volume
2. **MCP server startup**: Should auditor start MCP server or assume it's running?
   - **Recommendation**: Assume running (simpler, more flexible)
3. **Question validation**: How to validate question format?
   - **Recommendation**: Schema validation with clear error messages
4. **Consistency thresholds**: What constitutes "consistent"?
   - **Recommendation**: Configurable thresholds (default: 80%)

## Success Criteria

1. ✅ Auditor runs in container (<900MB image)
2. ✅ Uses embedded model (<300MB)
3. ✅ Executes audit with baseline + PF-MCP questions
4. ✅ Randomly interjects PF-MCP questions
5. ✅ Analyzes consistency across runs
6. ✅ Generates markdown + JSON reports
7. ✅ Accepts YAML configuration
8. ✅ Volume mounts PatternFly MCP codebase
9. ✅ Reserved model override capability

## Next Steps

1. Review and approve this plan
2. Create directory structure
3. Begin Phase 1 implementation
4. Iterate based on feedback


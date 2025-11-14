# Auditor Improvements Plan

**Date**: 2025-11-14  
**Status**: Planning

## Overview

Plan to address four key improvements to the PatternFly MCP Auditor:
1. MCP server startup script integration
2. Exit if MCP unavailable
3. Add "be concise" constraint to model prompts
4. Support both stdio and HTTP MCP transport modes

---

## 1. MCP Server Startup Script

### Requirement
Include a startup script for the MCP server in auditor npm scripts so the MCP server can be started automatically before running the audit.

### Analysis

**Option A: Separate npm script (Recommended)**
- Create `auditor:mcp:start` script that starts MCP in HTTP mode
- Run in background, track PID
- Provide `auditor:mcp:stop` to clean up
- **Pros**: Clear separation, can start/stop independently
- **Cons**: Requires manual coordination or wrapper script

**Option B: Integrated startup in auditor**
- Auditor automatically starts MCP if not running
- Detects if MCP is already running (check port)
- Starts if needed, stops on exit
- **Pros**: Fully automated, no manual steps
- **Cons**: More complex, harder to debug

**Option C: Wrapper script**
- Create `auditor:with-mcp` script that:
  1. Starts MCP server
  2. Waits for it to be ready
  3. Runs auditor
  4. Stops MCP on exit
- **Pros**: Simple, clear flow
- **Cons**: Less flexible

### Recommendation: **Option A + Option C (Hybrid)**

1. **Create standalone scripts**:
   - `auditor:mcp:start` - Start MCP server in HTTP mode
   - `auditor:mcp:stop` - Stop MCP server
   - `auditor:mcp:status` - Check if MCP is running

2. **Create convenience wrapper**:
   - `auditor:with-mcp` - Start MCP, run auditor, stop MCP
   - `auditor:with-mcp:quick` - Same but with quick audit
   - `auditor:with-mcp:full` - Same but with full audit

### Implementation Details

**MCP Startup Script** (`auditor/src/mcp-server.js`):
```javascript
// Spawn MCP server process
// Detect when ready (check for "PatternFly MCP server running on http://...")
// Return ServerInstance-like object with stop() method
// Handle cleanup on process exit
```

**NPM Scripts**:
```json
{
  "auditor:mcp:start": "node auditor/src/mcp-server.js start",
  "auditor:mcp:stop": "node auditor/src/mcp-server.js stop",
  "auditor:mcp:status": "node auditor/src/mcp-server.js status",
  "auditor:with-mcp": "node auditor/src/mcp-wrapper.js",
  "auditor:with-mcp:quick": "node auditor/src/mcp-wrapper.js --runs 3",
  "auditor:with-mcp:full": "node auditor/src/mcp-wrapper.js --runs 100"
}
```

### Files to Create/Modify
- `auditor/src/mcp-server.js` - MCP server process management
- `auditor/src/mcp-wrapper.js` - Wrapper script for start-audit-stop flow
- `package.json` - Add npm scripts

---

## 2. Exit if MCP Unavailable

### Requirement
The auditor should exit with a clear error if the MCP server is not available, rather than continuing with failed health checks.

### Analysis

**Current Behavior**:
- Health checks run and report failures
- Auditor continues anyway
- Results show failures but don't stop execution

**Desired Behavior**:
- Run health checks first
- If critical checks fail (MCP server not accessible), exit immediately
- Provide clear error message with troubleshooting steps

### Implementation Plan

**Modify `runHealthChecks()` in `auditor.js`**:
1. Add `critical` flag to health check config
2. After all checks, check for critical failures
3. If critical checks failed, throw error with details
4. Update `main()` in `index.js` to catch and exit

**Configuration Update**:
```yaml
healthChecks:
  - name: "server-accessible"
    type: "http"
    endpoint: "/health"
    critical: true  # NEW: Exit if this fails
  - name: "tools-registered"
    type: "mcp"
    tool: "usePatternFlyDocs"
    critical: true  # NEW: Exit if this fails
```

**Error Message**:
```
❌ Critical health check failed: server-accessible
   MCP server is not accessible at http://localhost:3000
   
   Troubleshooting:
   1. Ensure MCP server is running: npm run auditor:mcp:start
   2. Check the URL is correct: http://localhost:3000
   3. For containerized execution, use: http://host.containers.internal:3000
   
   Exiting audit.
```

### Files to Modify
- `auditor/src/auditor.js` - Add critical check validation
- `auditor/src/index.js` - Handle critical failures
- `auditor/config/audit-config.yaml` - Add critical flags

---

## 3. Add "Be Concise" Constraint

### Requirement
Add "be concise in your response" to model prompts to reduce long-winded answers and improve response times.

### Analysis

**Options**:
1. **Prepend to every prompt** - Simple, always applied
2. **Add to model system prompt** - If node-llama-cpp supports it
3. **Configurable constraint** - Allow customization
4. **Add to prompt template** - More flexible

### Recommendation: **Option 1 + Option 3 (Hybrid)**

1. **Default behavior**: Prepend "Please be concise in your response. " to all prompts
2. **Configurable**: Allow override via config
3. **Template system**: Support prompt templates for future extensibility

### Implementation Plan

**Modify `runAuditRun()` in `auditor.js`**:
```javascript
// Build prompt with conciseness constraint
const concisePrompt = config.model?.concise !== false 
  ? `Please be concise in your response. ${question.prompt}`
  : question.prompt;

// Send to model
const modelResponse = await model.complete(concisePrompt, {...});
```

**Configuration**:
```yaml
model:
  path: null
  temperature: 0.7
  maxTokens: 512
  concise: true  # NEW: Add conciseness constraint (default: true)
```

### Files to Modify
- `auditor/src/auditor.js` - Add prompt modification
- `auditor/config/audit-config.yaml` - Add concise option

---

## 4. Support Both stdio and HTTP MCP Transport

### Requirement
The auditor should be able to work with MCP server running in either stdio or HTTP mode.

### Analysis

**Current State**:
- Only HTTP transport is supported
- Uses `fetch()` to call MCP server
- Assumes HTTP endpoint

**stdio Mode Challenges**:
- Requires spawning MCP process
- Uses stdin/stdout for communication
- More complex than HTTP
- Need MCP client library or custom stdio handler

**Options**:

**Option A: Support HTTP only (Current)**
- **Pros**: Simple, already working
- **Cons**: Doesn't meet requirement

**Option B: Support both, detect automatically**
- Detect if URL is provided → HTTP mode
- Detect if no URL → stdio mode (spawn process)
- **Pros**: Flexible, automatic
- **Cons**: More complex, two code paths

**Option C: Explicit mode selection**
- Config option: `mcp.transport: "http" | "stdio"`
- HTTP: Use current implementation
- stdio: Spawn process and communicate via stdin/stdout
- **Pros**: Clear, explicit, easier to debug
- **Cons**: User must specify

### Recommendation: **Option C (Explicit Mode Selection)**

1. **Add transport mode to config**:
   ```yaml
   mcp:
     transport: "http"  # or "stdio"
     url: "http://localhost:3000"  # Required for HTTP
     # stdio mode doesn't need URL
   ```

2. **Create stdio client** (`auditor/src/mcp-stdio-client.js`):
   - Spawn MCP server process
   - Send JSON-RPC messages via stdin
   - Parse responses from stdout
   - Handle process lifecycle

3. **Update `callMcpMethod()` in `auditor.js`**:
   - Check `config.mcp.transport`
   - Route to HTTP client or stdio client
   - Abstract transport details

4. **Update health checks**:
   - HTTP: Check HTTP endpoint
   - stdio: Check if process is running and responsive

### Implementation Details

**stdio Client Interface**:
```javascript
class StdioMcpClient {
  async start() // Spawn MCP process
  async call(method, params) // Send JSON-RPC call
  async stop() // Cleanup process
  isRunning() // Check if process alive
}
```

**Modified `callMcpMethod()`**:
```javascript
async function callMcpMethod(method, params, config) {
  const transport = config.mcp?.transport || 'http';
  
  if (transport === 'stdio') {
    return await stdioClient.call(method, params);
  } else {
    return await httpClient.call(method, params, config);
  }
}
```

### Files to Create/Modify
- `auditor/src/mcp-stdio-client.js` - NEW: stdio transport client
- `auditor/src/auditor.js` - Update to support both transports
- `auditor/config/audit-config.yaml` - Add transport option
- `auditor/src/mcp-server.js` - Reuse for stdio mode startup

---

## Implementation Priority

### Phase 1: Critical (Do First)
1. ✅ **Exit if MCP unavailable** - Prevents wasted time
2. ✅ **Add "be concise" constraint** - Improves response quality

### Phase 2: Important (Do Next)
3. ✅ **MCP startup script** - Improves UX, reduces manual steps

### Phase 3: Deferred
4. ⏸️ **Support stdio transport** - Deferred to future enhancement
   - See `.agent/auditor-stdio-transport-future.md` for detailed plan
   - Adds significant complexity (process management, JSON-RPC)
   - HTTP transport meets current needs

---

## Implementation Order

1. **Exit on MCP failure** (Quick win, high value)
2. **Add conciseness constraint** (Quick win, improves quality)
3. **MCP startup scripts** (Medium effort, improves UX)
4. **stdio transport support** (Deferred - see `.agent/auditor-stdio-transport-future.md`)

---

## Configuration Changes Summary

### New Config Options

```yaml
mcp:
  transport: "http"  # NEW: "http" | "stdio"
  url: "http://localhost:3000"  # Required for HTTP mode
  timeout: 10000

model:
  concise: true  # NEW: Add conciseness constraint (default: true)
  # ... existing options

healthChecks:
  - name: "server-accessible"
    type: "http"
    endpoint: "/health"
    critical: true  # NEW: Exit if fails
```

---

## Testing Considerations

1. **MCP Startup**: Test process spawning, cleanup, error handling
2. **Exit on Failure**: Test with MCP down, verify clear error messages
3. **Conciseness**: Compare response lengths before/after
4. **stdio Transport**: Test full audit flow with stdio mode
5. **HTTP Transport**: Ensure existing functionality still works

---

## Open Questions

1. ~~**stdio Transport**: Should we use MCP SDK client or custom implementation?~~
   - **Decision**: Deferred - see `.agent/auditor-stdio-transport-future.md`
   
2. **MCP Process Management**: Should auditor manage MCP lifecycle or assume external?
   - **Decision**: Hybrid approach - provide scripts for both (auto-start vs external)
   
3. **Conciseness**: Should it be configurable per-question or global?
   - **Decision**: Global config (default: true), can override per-question later if needed

---

## Success Criteria

- ✅ Auditor exits immediately if MCP unavailable
- ✅ Model responses are more concise
- ✅ Can start MCP server via npm script
- ✅ Can run auditor with MCP in stdio or HTTP mode
- ✅ Clear error messages guide troubleshooting
- ✅ All existing functionality preserved


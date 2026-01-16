# Tool Auditor (Spec)

The **Tool Auditor** is a containerized environment designed for rigorous testing of MCP tools, resources, and prompts in an isolated, reproducible environment.

## Architecture
The auditor bundles the following components into a single Docker image:
1. **MCP Server**: The PatternFly MCP server instance.
2. **MCP Client**: A headless client (Node.js) for executing and validating tools.
3. **Local LLM / Proxy**: A connection to a model (e.g., via Llama.cpp or an OpenAI-compatible API).
4. **Validation Engine**: A test runner that verifies tool outputs against expected schemas.

## Usage (Planned)
```bash
docker run -it patternfly-mcp-auditor --test ./my-plugin.js --prompt "Create a login form"
```

## Goals
- **Schema Validation**: Ensure tools return valid JSON matching their `inputSchema`.
- **Latency Benchmarking**: Measure execution time for network-heavy resources.
- **Agent Success Rate**: Quantify how often an LLM successfully utilizes the tool to solve a specific design prompt.

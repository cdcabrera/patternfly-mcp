# Containerized CLI Tools

This directory contains containerized CLI tools that can be run without installing them directly on your system. All tools use Podman containers and can be accessed via npm scripts.

## Available Tools

### HuggingFace CLI

The HuggingFace CLI (`huggingface-cli`) is used for downloading models from HuggingFace Hub.

#### Quick Start

```bash
# Build the container (first time only)
npm run tools:huggingface:build

# Download a model
npm run tools:huggingface -- download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --local-dir ./auditor/models \
  --include "*.gguf"

# Or run interactively
npm run tools:huggingface -- --help
```

#### Usage Examples

**Download Qwen2.5-0.5B model for auditor:**
```bash
npm run tools:huggingface -- download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --local-dir ./auditor/models \
  --include "qwen2.5-0.5b-instruct-q4_k_m.gguf" \
  --local-dir-use-symlinks False
```

**List available files in a repository:**
```bash
npm run tools:huggingface -- scan-cache Qwen/Qwen2.5-0.5B-Instruct-GGUF
```

**Login to HuggingFace (for private repos):**
```bash
npm run tools:huggingface -- login
```

#### Volume Mounts

The container mounts:
- `./` (current directory) → `/workspace` in container
- `./data` → `/data` in container (optional)

This allows you to download models directly to your local filesystem.

## Adding New Tools

To add a new CLI tool (e.g., Ollama):

1. **Create tool directory:**
   ```bash
   mkdir -p tools/ollama
   ```

2. **Create Containerfile:**
   ```dockerfile
   # tools/ollama/Containerfile
   FROM ollama/ollama:latest
   WORKDIR /app
   VOLUME ["/workspace"]
   ENTRYPOINT ["ollama"]
   ```

3. **Add npm scripts to root `package.json`:**
   ```json
   {
     "scripts": {
       "tools:ollama:build": "podman build -t patternfly-tools-ollama ./tools/ollama/.",
       "tools:ollama": "podman run -it --rm -v \"$(pwd):/workspace\" --name ollama patternfly-tools-ollama"
     }
   }
   ```
   
   **Note**: Replace `podman` with `docker` if you prefer Docker.

4. **Update this README** with the new tool's documentation.

## NPM Scripts Pattern

All tools follow this pattern:

- **Build**: `npm run tools:<tool>:build` - Builds the container image
- **Run**: `npm run tools:<tool>` - Runs the container with volume mounts
- **Run with args**: `npm run tools:<tool> -- <args>` - Passes arguments to the CLI

## Requirements

- **Podman** (preferred) or **Docker** - Container runtime
- **Node.js & npm** - For running npm scripts

### Using Docker Instead of Podman

If you prefer Docker, you can replace `podman` with `docker` in the npm scripts, or create aliases:

```bash
# Add to your shell config (~/.zshrc or ~/.bashrc)
alias podman=docker
```

The scripts will work identically with Docker.

## Troubleshooting

### Container won't start

Check if Podman is running:
```bash
podman ps
```

### Permission issues

On Linux, you may need to add your user to the podman group or use `sudo`.

### Volume mounts not working

Ensure paths are absolute or relative to the project root. The container mounts `$(pwd)` to `/workspace`.

### Tool not found

Make sure you've built the container first:
```bash
npm run tools:<tool>:build
```

## Future Tools

Potential tools to add:

- **Ollama** - For running local LLMs
- **Git LFS** - For large file handling
- **Model converters** - For converting between model formats
- **Other ML tooling** - As needed


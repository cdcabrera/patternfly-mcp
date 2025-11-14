# HuggingFace CLI Container

Containerized HuggingFace CLI (`hf` command) for downloading models without installing Python/pip locally.

## Quick Start

```bash
# Build the container (first time only)
npm run tools:huggingface:build

# Download a model
npm run tools:huggingface -- download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --local-dir ./auditor/models \
  --include "*.gguf"
```

**Note**: This container uses the modern `hf` command. The older `huggingface-cli` command is deprecated.

## Common Commands

### Download Model for Auditor

```bash
npm run tools:huggingface -- download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --local-dir ./auditor/models \
  --include "qwen2.5-0.5b-instruct-q4_k_m.gguf" \
  --local-dir-use-symlinks False
```

### List Files in Repository

```bash
npm run tools:huggingface -- scan-cache Qwen/Qwen2.5-0.5B-Instruct-GGUF
```

### Login (for private repos)

```bash
npm run tools:huggingface -- login
```

### Get Help

```bash
npm run tools:huggingface -- --help
```

## Volume Mounts

The container mounts your current directory (`$(pwd)`) to `/workspace` in the container, so:

- `./auditor/models` in your host → `/workspace/auditor/models` in container
- Downloads go directly to your local filesystem

## Manual Usage

If you prefer to run the container manually:

```bash
# Build
podman build -t patternfly-tools-huggingface ./tools/huggingface-cli/.

# Run (using 'hf' command)
podman run -it --rm \
  -v "$(pwd):/workspace" \
  --name huggingface-cli \
  patternfly-tools-huggingface \
  download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --local-dir /workspace/auditor/models
```

## See Also

- [Main tools README](../README.md) - Overview of all containerized tools
- [Auditor MODEL-SETUP.md](../../auditor/MODEL-SETUP.md) - Model setup guide


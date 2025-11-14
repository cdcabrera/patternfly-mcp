# Model Setup Guide

The PatternFly MCP Auditor uses `node-llama-cpp` to run an embedded model for consistency testing.

## Model Requirements

- **Format**: GGUF format
- **Size**: <300MB recommended (for <900MB total image size)
- **Recommended**: Qwen2.5-0.5B-Instruct (quantized Q4_K_M)

## Model Locations

The auditor checks for models in the following order:

1. **Custom model path** (via config: `model.path`)
2. **Volume mount** (`/workspace/model/qwen2.5-0.5b-instruct-q4_k_m.gguf`)
3. **Local directory** (`./models/qwen2.5-0.5b-instruct-q4_k_m.gguf`)

## Downloading Models

### Option 1: HuggingFace CLI (Recommended - Containerized)

**No local installation needed!** Use the containerized HuggingFace CLI:

```bash
# Build the container (first time only)
npm run tools:huggingface:build

# Create models directory
mkdir -p auditor/models

# Download Qwen2.5-0.5B-Instruct Q4_K_M (recommended, ~300MB)
npm run tools:huggingface -- download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --local-dir ./auditor/models \
  --include "qwen2.5-0.5b-instruct-q4_k_m.gguf" \
  --local-dir-use-symlinks False
```

**Or download directly via curl:**
```bash
curl -L -o auditor/models/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

See [tools/README.md](../tools/README.md) for more HuggingFace CLI examples.

### Option 2: Other Models

Any GGUF format model compatible with `node-llama-cpp` will work. Popular small models:

- **Qwen2.5-0.5B-Instruct** (~300MB) - Recommended
- **Phi-3-mini** (~200MB) - Very small
- **TinyLlama-1.1B** (~600MB) - Slightly larger but good performance

### Option 3: Volume Mount (Container)

When running in a container, mount the model:

```bash
podman run -v /path/to/model:/workspace/model \
  -v /path/to/patternfly-mcp:/workspace/patternfly-mcp \
  patternfly-mcp-auditor
```

## Configuration

Update `config/audit-config.yaml`:

```yaml
model:
  path: null  # null = auto-detect, or path to model file
  temperature: 0.7
  maxTokens: 512
```

## Development Mode

If no model is found, the auditor will automatically use a **mock model** for development/testing. This allows testing the audit infrastructure without downloading a model.

## Model Compatibility

The auditor includes a compatibility check for custom models:

- Validates file exists
- Attempts to load with `node-llama-cpp`
- Provides clear error messages if incompatible

## Troubleshooting

### Model Not Found

```
⚠️  Default model not found. Using mock model for development.
📥 To use a real model, download Qwen2.5-0.5B and place it in ./models/ or /workspace/model/
```

**Solution**: Download a model using one of the methods above.

### Model Loading Failed

```
Failed to load custom model: Model loading failed: ...
```

**Solutions**:
- Ensure model is in GGUF format
- Check file permissions
- Verify model is compatible with node-llama-cpp v3.14.2
- Try a different quantization (Q4_K_M recommended)

### Out of Memory

If the model is too large or system has limited RAM:

- Use a smaller model (Qwen2.5-0.5B or Phi-3-mini)
- Use a more aggressive quantization (Q4_K_M or Q3_K_M)
- Reduce context size in `initializeModel()` (currently 2048)


# Model Setup Guide

The PatternFly MCP Auditor uses `node-llama-cpp` to run an embedded model for consistency testing.

## Model Requirements

- **Format**: GGUF format
- **Size**: <300MB recommended (for <900MB total image size)
- **Recommended**: Qwen2.5-0.5B-Instruct (quantized Q4_K_M)

## Model Locations

The auditor checks for models in the following order (first match wins):

1. **Custom model path** (via config: `model.path`)
2. **Container volume mount - dedicated** (`/workspace/model/`) - For dedicated model volume
3. **Container volume mount - auditor** (`/workspace/auditor/models/`) - **For containerized execution** ✅
4. **Auditor models directory** (`auditor/models/`) - **Recommended for local execution** ✅
5. **Root models directory** (`./models/` from project root)
6. **Current working directory** (`./models/` from where command is run)

**Recommended**: Place models in `auditor/models/` - this works whether you run from root or auditor directory.

**Note**: If multiple models are found, the auditor will:
1. Prefer models matching: `qwen2.5-0.5b-instruct-q4_k_m.gguf`, `qwen2.5-0.5b-instruct.gguf`, or `qwen2.5-0.5b.gguf`
2. Otherwise, use the first `.gguf` file found (alphabetically)
3. Log which model was selected and any other models found

## Downloading Models

### Option 1: HuggingFace CLI (Recommended - Containerized)

**No local installation needed!** Use the containerized HuggingFace CLI:

```bash
# Build the container (first time only)
npm run tools:huggingface:build

# Create models directory (if it doesn't exist)
mkdir -p auditor/models

# Download Qwen2.5-0.5B-Instruct Q4_K_M (recommended, ~300MB)
npm run tools:huggingface -- download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --local-dir ./auditor/models \
  --include "qwen2.5-0.5b-instruct-q4_k_m.gguf" \
  --local-dir-use-symlinks False

# The auditor will automatically find any .gguf file in auditor/models/
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
⚠️  No model found in any of these locations:
   - /workspace/model
   - auditor/models/
   - ./models/
   ...
```

**Solution**: 
1. Ensure models are in `auditor/models/` directory (recommended)
2. Models must be in GGUF format (`.gguf` extension)
3. Check that the file has read permissions
4. Verify the path is correct: `ls -lh auditor/models/*.gguf`

**Quick check**: Run the auditor and look for the "Found model" message:
```
✅ Found model: /path/to/auditor/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

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


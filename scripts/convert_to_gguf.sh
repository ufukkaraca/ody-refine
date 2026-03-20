#!/bin/bash
# Convert a LoRA adapter to GGUF format for use with Ollama.
# Usage: ./convert_to_gguf.sh <adapter-dir> <base-model> [output-path]
# Requires: llama.cpp built locally (git clone + make), Python 3.10+

set -euo pipefail

ADAPTER_DIR="${1:?Usage: $0 <adapter-dir> <base-model> [output-path]}"
BASE_MODEL="${2:?Usage: $0 <adapter-dir> <base-model> [output-path]}"
OUTPUT_PATH="${3:-./model.gguf}"
QUANT_TYPE="Q4_K_M"

MERGED_DIR="$(mktemp -d)/merged"

# Check for llama.cpp
if ! command -v llama-export &>/dev/null; then
    LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-}"
    if [ -z "$LLAMA_CPP_DIR" ]; then
        echo "Error: llama.cpp not found."
        echo "Either install it or set LLAMA_CPP_DIR to your llama.cpp directory."
        echo ""
        echo "Quick setup:"
        echo "  git clone https://github.com/ggerganov/llama.cpp"
        echo "  cd llama.cpp && make"
        echo "  export LLAMA_CPP_DIR=\$(pwd)"
        exit 1
    fi
    CONVERT_SCRIPT="$LLAMA_CPP_DIR/convert_hf_to_gguf.py"
    QUANTIZE_BIN="$LLAMA_CPP_DIR/llama-quantize"
else
    CONVERT_SCRIPT="convert_hf_to_gguf.py"
    QUANTIZE_BIN="llama-quantize"
fi

if [ -n "${LLAMA_CPP_DIR:-}" ]; then
    if [ ! -f "$CONVERT_SCRIPT" ]; then
        echo "Error: $CONVERT_SCRIPT not found"
        exit 1
    fi
    if [ ! -f "$QUANTIZE_BIN" ]; then
        echo "Error: $QUANTIZE_BIN not found (run 'make' in llama.cpp)"
        exit 1
    fi
fi

echo "=== Ody GGUF Converter ==="
echo "Adapter:    $ADAPTER_DIR"
echo "Base model: $BASE_MODEL"
echo "Output:     $OUTPUT_PATH"
echo "Quant:      $QUANT_TYPE"
echo ""

# Step 1: Merge LoRA adapter with base model
echo "[1/4] Merging LoRA adapter with base model..."
python3 -c "
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

print('Loading base model...')
model = AutoModelForCausalLM.from_pretrained('$BASE_MODEL', trust_remote_code=True)
tokenizer = AutoTokenizer.from_pretrained('$BASE_MODEL', trust_remote_code=True)

print('Loading adapter...')
model = PeftModel.from_pretrained(model, '$ADAPTER_DIR')

print('Merging weights...')
model = model.merge_and_unload()

print('Saving merged model...')
model.save_pretrained('$MERGED_DIR')
tokenizer.save_pretrained('$MERGED_DIR')
print('Done.')
"

# Step 2: Convert to GGUF (f16)
echo "[2/4] Converting to GGUF (f16)..."
F16_PATH="${OUTPUT_PATH%.gguf}-f16.gguf"
if [ -n "${LLAMA_CPP_DIR:-}" ]; then
    python3 "$CONVERT_SCRIPT" "$MERGED_DIR" --outfile "$F16_PATH" --outtype f16
else
    convert_hf_to_gguf.py "$MERGED_DIR" --outfile "$F16_PATH" --outtype f16
fi

# Step 3: Quantize
echo "[3/4] Quantizing to $QUANT_TYPE..."
"$QUANTIZE_BIN" "$F16_PATH" "$OUTPUT_PATH" "$QUANT_TYPE"

# Clean up intermediate files
rm -rf "$MERGED_DIR" "$F16_PATH"

# Step 4: Generate Ollama Modelfile
MODELFILE_PATH="$(dirname "$OUTPUT_PATH")/Modelfile"
cat > "$MODELFILE_PATH" <<MODELFILE
FROM $OUTPUT_PATH

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER stop <|user|>
PARAMETER stop <|assistant|>

SYSTEM You are a helpful assistant trained on organization-specific knowledge. Answer questions accurately based on your training data. If you're unsure, say so.
MODELFILE

echo "[4/4] Created Ollama Modelfile at $MODELFILE_PATH"
echo ""
echo "=== Done! ==="
echo ""
echo "To use with Ollama:"
echo "  ollama create my-org-model -f $MODELFILE_PATH"
echo "  ollama run my-org-model"
echo ""
echo "Model size: $(du -h "$OUTPUT_PATH" | cut -f1)"

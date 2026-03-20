#!/usr/bin/env bash
# Setup script for the Ody Forge training environment.
# Creates a Python virtual environment with all ML dependencies needed
# for local model training (SFT, DPO, GRPO with LoRA).
#
# Usage:
#   bash scripts/setup-training-env.sh
#
# After running:
#   export ODY_PYTHON_BIN=~/.ody/training-venv/bin/python3
#   export ODY_LLM_MODEL=llama3.2:3b  # or qwen2.5:7b

set -euo pipefail

VENV_DIR="${ODY_TRAINING_VENV:-$HOME/.ody/training-venv}"

echo "==> Setting up Ody Forge training environment"
echo "    Python venv: $VENV_DIR"

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1)
echo "    System Python: $PYTHON_VERSION"

# Create venv
if [ -d "$VENV_DIR" ]; then
  echo "    Venv already exists. Updating packages..."
else
  echo "    Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

# Upgrade pip
"$VENV_DIR/bin/pip" install --upgrade pip -q

# Install ML dependencies
echo "    Installing ML dependencies (torch, transformers, trl, peft, datasets, accelerate)..."
"$VENV_DIR/bin/pip" install torch transformers trl peft datasets accelerate -q

# Verify installation
echo ""
echo "==> Verifying installation:"
"$VENV_DIR/bin/python3" -c "
import torch
import transformers
import trl
import peft
import datasets
import accelerate
print(f'    torch:        {torch.__version__}')
print(f'    transformers: {transformers.__version__}')
print(f'    trl:          {trl.__version__}')
print(f'    peft:         {peft.__version__}')
print(f'    datasets:     {datasets.__version__}')
print(f'    accelerate:   {accelerate.__version__}')
if torch.backends.mps.is_available():
    print('    MPS (Apple Silicon GPU): available')
else:
    print('    MPS (Apple Silicon GPU): not available, using CPU')
"

echo ""
echo "==> Setup complete!"
echo ""
echo "Add these to your shell profile or use before running Forge:"
echo "  export ODY_PYTHON_BIN=$VENV_DIR/bin/python3"
echo "  export ODY_LLM_MODEL=llama3.2:3b"
echo ""
echo "Then run training:"
echo "  # Forge CLI is in the separate ody/forge/ repo"
echo "  node ../forge/apps/dist/cli.js train start --dataset <id> --base qwen2.5:0.5b --method dpo"

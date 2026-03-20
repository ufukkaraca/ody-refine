#!/usr/bin/env python3
"""
Modal function definition for Ody Forge remote training.

Usage:
    modal run scripts/modal-training.py

This defines a Modal app with a `train` function that:
- Receives a training script + dataset as inputs
- Executes the training script on a cloud GPU
- Returns model artifact metadata

GPU selection: T4 for small models (<7B), A100 for 7B+.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import modal

# Modal image with training dependencies pre-installed
training_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch>=2.1.0",
    "transformers>=4.40.0",
    "trl>=0.8.0",
    "peft>=0.10.0",
    "datasets>=2.19.0",
    "accelerate>=0.30.0",
    "bitsandbytes>=0.43.0",
    "sentencepiece>=0.2.0",
    "protobuf>=4.25.0",
)

app = modal.App("ody-training", image=training_image)

# Shared volume for model artifacts
artifacts_volume = modal.Volume.from_name(
    "ody-training-artifacts", create_if_missing=True
)


@app.function(
    gpu="T4",
    timeout=7200,
    volumes={"/artifacts": artifacts_volume},
)
def train_t4(
    training_script: str,
    dataset_jsonl: str,
    base_model: str,
    method: str,
) -> str:
    """Train on T4 GPU — suitable for models up to ~3B parameters."""
    return _run_training(training_script, dataset_jsonl, base_model, method)


@app.function(
    gpu="A100",
    timeout=14400,
    volumes={"/artifacts": artifacts_volume},
)
def train_a100(
    training_script: str,
    dataset_jsonl: str,
    base_model: str,
    method: str,
) -> str:
    """Train on A100 GPU — suitable for 7B+ parameter models."""
    return _run_training(training_script, dataset_jsonl, base_model, method)


@app.function(timeout=14400)
def train(
    training_script: str,
    dataset_jsonl: str,
    base_model: str,
    method: str,
    gpu: str = "T4",
) -> str:
    """
    Dispatcher: routes to the correct GPU-specific function.
    Called by the Node.js RemoteTrainer via Modal's REST API.
    """
    if gpu.upper() in ("A100", "A100-40GB", "A100-80GB"):
        return train_a100.remote(
            training_script, dataset_jsonl, base_model, method
        )
    return train_t4.remote(
        training_script, dataset_jsonl, base_model, method
    )


def _run_training(
    training_script: str,
    dataset_jsonl: str,
    base_model: str,
    method: str,
) -> str:
    """Execute the training script with the provided dataset."""
    work_dir = Path(tempfile.mkdtemp(prefix="ody-train-"))
    script_path = work_dir / "train.py"
    dataset_path = work_dir / "dataset.jsonl"
    output_dir = work_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Write training script and dataset to temp files
    script_path.write_text(training_script)
    dataset_path.write_text(dataset_jsonl)

    print(f"[ody] Base model: {base_model}")
    print(f"[ody] Method: {method}")
    print(f"[ody] Dataset size: {len(dataset_jsonl)} bytes")
    print(f"[ody] Script size: {len(training_script)} bytes")
    print(f"[ody] Output dir: {output_dir}")

    # Run the training script
    result = subprocess.run(
        [sys.executable, str(script_path), str(dataset_path), str(output_dir)],
        capture_output=True,
        text=True,
        cwd=str(work_dir),
    )

    print("[ody] stdout:", result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
    if result.stderr:
        print("[ody] stderr:", result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr)

    if result.returncode != 0:
        raise RuntimeError(
            f"Training script exited with code {result.returncode}:\n"
            f"{result.stderr[-1000:]}"
        )

    # Copy artifacts to the shared volume for persistence
    artifact_dest = Path("/artifacts") / base_model.replace("/", "--") / method
    artifact_dest.mkdir(parents=True, exist_ok=True)

    import shutil
    for item in output_dir.iterdir():
        dest = artifact_dest / item.name
        if item.is_dir():
            shutil.copytree(str(item), str(dest), dirs_exist_ok=True)
        else:
            shutil.copy2(str(item), str(dest))

    # Read artifact metadata if it exists
    meta_path = output_dir / "artifact-meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
    else:
        meta = {
            "modelPath": str(artifact_dest),
            "baseModel": base_model,
            "method": method,
            "status": "complete",
        }

    meta["volumePath"] = str(artifact_dest)
    meta["status"] = "complete"

    return json.dumps(meta)


@app.cls(gpu="T4", timeout=7200, volumes={"/artifacts": artifacts_volume})
class Trainer:
    """Web endpoint wrapper so ModalClient can call training over HTTPS."""

    @modal.web_endpoint(method="POST")
    def train(self, request: dict) -> dict:
        """POST {training_script, dataset_jsonl, base_model, method} → result."""
        result_json = _run_training(
            request["training_script"],
            request["dataset_jsonl"],
            request["base_model"],
            request["method"],
        )
        return json.loads(result_json)


# Local entrypoint for testing
@app.local_entrypoint()
def main():
    """Test entrypoint: runs a minimal training job."""
    test_script = """
import sys
from pathlib import Path

dataset_path = sys.argv[1] if len(sys.argv) > 1 else "dataset.jsonl"
output_dir = sys.argv[2] if len(sys.argv) > 2 else "./output"

Path(output_dir).mkdir(parents=True, exist_ok=True)
print(f"Mock training on {dataset_path}")
print(f"Output: {output_dir}")

import json
meta = {"modelPath": output_dir, "baseModel": "test", "method": "sft", "status": "complete"}
with open(str(Path(output_dir) / "artifact-meta.json"), "w") as f:
    json.dump(meta, f)
print("Training complete")
"""
    test_dataset = '{"instruction": "What is 2+2?", "response": "4"}\n'
    result = train.remote(test_script, test_dataset, "test-model", "sft", "T4")
    print("Result:", result)

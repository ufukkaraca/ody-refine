#!/usr/bin/env python3
"""
Modal serving endpoint for Ody trained models.

Usage:
    modal deploy scripts/serve-modal.py   # deploy permanently
    modal serve scripts/serve-modal.py    # dev mode (hot reload)

Serves a trained model from the ody-training-artifacts volume via HTTP.
Endpoint: POST /generate  {prompt, max_tokens?}
Returns:  {text, model_id, tokens_used}

GPU: T4 for Qwen2.5-3B class models.
"""

import json
import os
from pathlib import Path

import modal

serving_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch>=2.1.0",
    "transformers>=4.40.0",
    "accelerate>=0.30.0",
    "sentencepiece>=0.2.0",
    "protobuf>=4.25.0",
    "peft>=0.10.0",
)

app = modal.App("ody-serving", image=serving_image)

# Same volume used by modal-training.py
artifacts_volume = modal.Volume.from_name(
    "ody-training-artifacts", create_if_missing=True
)

# Configurable via modal secret or env vars
DEFAULT_BASE_MODEL = os.environ.get("ODY_BASE_MODEL", "Qwen/Qwen2.5-3B")
DEFAULT_METHOD = os.environ.get("ODY_METHOD", "sft")


@app.cls(
    gpu="T4",
    timeout=300,
    volumes={"/artifacts": artifacts_volume},
    allow_concurrent_inputs=4,
    container_idle_timeout=300,
)
class ModelServer:
    """Loads a trained model on container start, serves inference via HTTP."""

    @modal.enter()
    def load_model(self) -> None:
        """Load model + adapter on container startup."""
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel

        base_model = os.environ.get("ODY_BASE_MODEL", DEFAULT_BASE_MODEL)
        method = os.environ.get("ODY_METHOD", DEFAULT_METHOD)
        artifact_dir = Path("/artifacts") / base_model.replace("/", "--") / method

        self.model_id = f"ody:{base_model.split('/')[-1]}-{method}"
        self.has_adapter = False

        # Load artifact metadata if available
        meta_path = artifact_dir / "artifact-meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            print(f"[ody-serve] Artifact meta: {meta}")
            self.model_id = meta.get("modelPath", self.model_id)

        print(f"[ody-serve] Loading base model: {base_model}")
        self.tokenizer = AutoTokenizer.from_pretrained(
            base_model, trust_remote_code=True
        )
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        self.model = AutoModelForCausalLM.from_pretrained(
            base_model,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )

        # Try loading LoRA adapter from artifact dir
        adapter_config = artifact_dir / "adapter_config.json"
        if adapter_config.exists():
            print(f"[ody-serve] Loading LoRA adapter from {artifact_dir}")
            self.model = PeftModel.from_pretrained(
                self.model, str(artifact_dir)
            )
            self.has_adapter = True
        elif artifact_dir.exists():
            print(f"[ody-serve] Artifact dir exists but no adapter_config.json found")
            print(f"[ody-serve] Contents: {list(artifact_dir.iterdir())}")
        else:
            print(f"[ody-serve] No artifact dir at {artifact_dir}, serving base model only")

        self.model.eval()
        print(f"[ody-serve] Model ready: {self.model_id} (adapter: {self.has_adapter})")

    @modal.web_endpoint(method="POST")
    def generate(self, request: dict) -> dict:
        """Generate text from the loaded model.

        Request:  {"prompt": str, "max_tokens": int (default 256)}
        Response: {"text": str, "model_id": str, "tokens_used": int}
        """
        import torch

        prompt = request.get("prompt", "")
        max_tokens = min(request.get("max_tokens", 256), 2048)

        if not prompt:
            return {"error": "prompt is required", "text": "", "model_id": self.model_id, "tokens_used": 0}

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        input_len = inputs["input_ids"].shape[1]

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                pad_token_id=self.tokenizer.pad_token_id,
            )

        generated_ids = outputs[0][input_len:]
        text = self.tokenizer.decode(generated_ids, skip_special_tokens=True)
        tokens_used = len(generated_ids)

        return {
            "text": text,
            "model_id": self.model_id,
            "tokens_used": tokens_used,
        }

    @modal.web_endpoint(method="GET")
    def health(self) -> dict:
        """Health check — returns model info."""
        return {
            "status": "ok",
            "model_id": self.model_id,
            "has_adapter": self.has_adapter,
        }

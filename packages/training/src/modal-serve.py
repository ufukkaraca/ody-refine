"""
Modal serving endpoint for fine-tuned Ody models.

Loads a base model with LoRA adapter from a Modal Volume and serves
an OpenAI-compatible /v1/chat/completions endpoint. Scales to zero
when idle; warm containers persist for 5 minutes.

Usage:
    modal deploy packages/training/src/modal-serve.py
"""

from __future__ import annotations

import os
import time
from typing import Any

import modal

# ---------------------------------------------------------------------------
# Modal resources
# ---------------------------------------------------------------------------

VOLUME_NAME = "ody-models"
MODEL_DIR = "/models"
GPU_TYPE = os.environ.get("ODY_SERVE_GPU", "T4")
IDLE_TIMEOUT = 300  # 5 minutes

app = modal.App("ody-serving")
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.2",
        "transformers>=4.40",
        "peft>=0.10",
        "accelerate>=0.29",
    )
)


# ---------------------------------------------------------------------------
# Inference service
# ---------------------------------------------------------------------------

@app.cls(
    image=image,
    gpu=GPU_TYPE,
    volumes={MODEL_DIR: volume},
    container_idle_timeout=IDLE_TIMEOUT,
    secrets=[modal.Secret.from_name("ody-modal", required=False)],
)
class Inference:
    """Serves a base model + LoRA adapter as an OpenAI-compatible endpoint."""

    def __init__(self) -> None:
        self.model: Any = None
        self.tokenizer: Any = None

    @modal.enter()
    def load_model(self) -> None:
        """Load the base model and merge the LoRA adapter on container start."""
        from peft import PeftModel  # type: ignore[import-untyped]
        from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore[import-untyped]

        base_model_id: str = os.environ.get(
            "ODY_BASE_MODEL", "Qwen/Qwen2.5-7B-Instruct"
        )
        adapter_path: str = os.environ.get(
            "ODY_ADAPTER_PATH", f"{MODEL_DIR}/adapter"
        )

        self.tokenizer = AutoTokenizer.from_pretrained(base_model_id)
        base = AutoModelForCausalLM.from_pretrained(
            base_model_id, device_map="auto", torch_dtype="auto"
        )
        self.model = PeftModel.from_pretrained(base, adapter_path)
        self.model.eval()

    @modal.web_endpoint(method="POST", label="v1-chat-completions")
    def v1_chat_completions(self, request: dict[str, Any]) -> dict[str, Any]:
        """OpenAI-compatible /v1/chat/completions endpoint.

        Args:
            request: JSON body with ``messages``, optional ``temperature``
                     and ``max_tokens``.

        Returns:
            OpenAI-shaped response with ``choices[0].message``.
        """
        import torch

        messages: list[dict[str, str]] = request.get("messages", [])
        temperature: float = request.get("temperature", 0.7)
        max_tokens: int = request.get("max_tokens", 512)
        model_name: str = request.get("model", "ody-custom")

        text = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self.tokenizer(text, return_tensors="pt").to(self.model.device)

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=temperature if temperature > 0 else 1.0,
                do_sample=temperature > 0,
            )

        generated = outputs[0][inputs["input_ids"].shape[-1] :]
        content: str = self.tokenizer.decode(generated, skip_special_tokens=True)

        return {
            "id": f"chatcmpl-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": inputs["input_ids"].shape[-1],
                "completion_tokens": len(generated),
                "total_tokens": inputs["input_ids"].shape[-1] + len(generated),
            },
        }

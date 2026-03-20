#!/usr/bin/env python3
"""
ODY-140: Reproducible SFT training + full 20-question eval on Modal GPU.

Trains a base model with LoRA SFT, then evaluates both the base and
fine-tuned model on ALL eval questions. Returns structured JSON results.

Usage:
    modal run scripts/modal-reproduce.py \
        --seed 42 \
        --base-model "Qwen/Qwen2.5-3B" \
        --dataset eval/fixtures/acme-training/sft-pairs.jsonl \
        --eval-questions eval/fixtures/acme-training/eval-questions.jsonl
"""

import json
import sys
import tempfile
from pathlib import Path

import modal

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

app = modal.App("ody-reproduce", image=training_image)
vol = modal.Volume.from_name("ody-training-artifacts", create_if_missing=True)


def _evaluate_model(model, tokenizer, eval_questions: list[dict]) -> list[dict]:
    """Run inference on each eval question, score by key_facts presence."""
    import torch

    results = []
    for eq in eval_questions:
        if hasattr(tokenizer, "apply_chat_template"):
            messages = [{"role": "user", "content": eq['question']}]
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        else:
            prompt = f"<|im_start|>user\n{eq['question']}<|im_end|>\n<|im_start|>assistant\n"
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=256,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
            )
        response = tokenizer.decode(
            outputs[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True
        )
        key_facts = eq.get("key_facts", [])
        response_lower = response.lower()
        hits = [f for f in key_facts if f.lower() in response_lower]
        # Correct if at least half of key_facts found (minimum 1)
        threshold = max(1, len(key_facts) // 2)
        correct = len(hits) >= threshold
        results.append(
            {
                "correct": correct,
                "facts_hit": len(hits),
                "facts_total": len(key_facts),
                "response_preview": response[:200],
            }
        )
    return results


@app.function(gpu="A100", timeout=7200, volumes={"/artifacts": vol})
def train_and_eval(
    dataset_jsonl: str,
    eval_questions: list[dict],
    base_model: str,
    seed: int,
) -> dict:
    """Train SFT on T4, then evaluate base vs fine-tuned on all questions."""
    import torch
    from datasets import load_dataset
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer, set_seed
    from trl import SFTConfig, SFTTrainer

    set_seed(seed)
    work_dir = Path(tempfile.mkdtemp(prefix="ody-reproduce-"))
    dataset_path = work_dir / "dataset.jsonl"
    output_dir = work_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_path.write_text(dataset_jsonl)

    print(f"[ody] Base model: {base_model}, seed: {seed}")
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # --- Evaluate BASE model ---
    print(f"[ody] Evaluating base model on {len(eval_questions)} questions...")
    base_model_obj = AutoModelForCausalLM.from_pretrained(
        base_model, torch_dtype=torch.float16, device_map="auto"
    )
    base_model_obj.eval()
    base_results = _evaluate_model(base_model_obj, tokenizer, eval_questions)
    del base_model_obj
    torch.cuda.empty_cache()

    # --- SFT Training ---
    print(f"[ody] Training SFT on {dataset_jsonl.count(chr(10))} pairs...")
    model = AutoModelForCausalLM.from_pretrained(
        base_model, torch_dtype=torch.float16, device_map="auto"
    )
    dataset = load_dataset("json", data_files=str(dataset_path), split="train")
    # Use model's native chat template for better knowledge injection
    def format_chat(x):
        if hasattr(tokenizer, "apply_chat_template"):
            messages = [{"role": "user", "content": x["instruction"]}, {"role": "assistant", "content": x["response"]}]
            return {"text": tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)}
        return {"text": f"<|im_start|>user\n{x['instruction']}<|im_end|>\n<|im_start|>assistant\n{x['response']}<|im_end|>"}
    dataset = dataset.map(format_chat)
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        task_type="CAUSAL_LM",
    )
    training_args = SFTConfig(
        output_dir=str(output_dir),
        num_train_epochs=3,
        per_device_train_batch_size=4,
        learning_rate=2e-5,
        warmup_steps=100,
        logging_steps=10,
        save_strategy="epoch",
        max_length=1024,
        gradient_checkpointing=True,
        report_to="none",
        seed=seed,
    )
    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        args=training_args,
        train_dataset=dataset,
        peft_config=peft_config,
    )
    trainer.train()
    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    # --- Evaluate FINE-TUNED model ---
    print(f"[ody] Evaluating fine-tuned model on {len(eval_questions)} questions...")
    model.eval()
    ft_results = _evaluate_model(model, tokenizer, eval_questions)

    base_correct = sum(1 for r in base_results if r["correct"])
    ft_correct = sum(1 for r in ft_results if r["correct"])
    print(f"[ody] Base: {base_correct}/{len(eval_questions)}, "
          f"Fine-tuned: {ft_correct}/{len(eval_questions)}")

    return {
        "seed": seed,
        "base_model": base_model,
        "total_questions": len(eval_questions),
        "base_score": base_correct,
        "finetuned_score": ft_correct,
        "questions": [
            {
                "idx": i + 1,
                "question": eq["question"][:80],
                "base_correct": base_results[i]["correct"],
                "ft_correct": ft_results[i]["correct"],
                "base_facts_hit": base_results[i]["facts_hit"],
                "ft_facts_hit": ft_results[i]["facts_hit"],
                "facts_total": ft_results[i]["facts_total"],
            }
            for i, eq in enumerate(eval_questions)
        ],
    }


@app.cls(gpu="A100", timeout=7200, volumes={"/artifacts": vol})
class Trainer:
    """Web endpoint wrapper so ModalClient can call training over HTTPS."""

    @modal.web_endpoint(method="POST")
    def train(self, request: dict) -> dict:
        """POST {dataset_json, base_model, seed, eval_questions} → result."""
        import time
        start = time.time()
        result = train_and_eval.local(
            dataset_jsonl=request["dataset_json"],
            eval_questions=request["eval_questions"],
            base_model=request.get("base_model", "Qwen/Qwen2.5-3B"),
            seed=request.get("seed", 42),
        )
        elapsed = time.time() - start
        return {
            "status": "completed",
            "training_time": round(elapsed, 1),
            "base_scores": result["base_score"],
            "trained_scores": result["finetuned_score"],
            "artifact_path": f"/artifacts/{result['base_model'].replace('/', '--')}/reproduce",
        }


@app.local_entrypoint()
def main(
    seed: int = 42,
    base_model: str = "Qwen/Qwen2.5-3B",
    dataset: str = "eval/fixtures/acme-training/sft-pairs.jsonl",
    eval_questions: str = "eval/fixtures/acme-training/eval-questions.jsonl",
):
    """Read local files, dispatch training+eval to Modal GPU."""
    dataset_path = Path(dataset)
    eval_path = Path(eval_questions)
    if not dataset_path.exists():
        print(f"ERROR: Dataset not found: {dataset_path}")
        sys.exit(1)
    if not eval_path.exists():
        print(f"ERROR: Eval questions not found: {eval_path}")
        sys.exit(1)

    dataset_jsonl = dataset_path.read_text()
    questions = [
        json.loads(line)
        for line in eval_path.read_text().strip().splitlines()
        if line.strip()
    ]
    print(f"[ody] Dataset: {len(dataset_jsonl.strip().splitlines())} pairs")
    print(f"[ody] Eval: {len(questions)} questions")
    print(f"[ody] Model: {base_model}, seed: {seed}")

    result = train_and_eval.remote(dataset_jsonl, questions, base_model, seed)
    # Machine-readable output line for shell script parsing
    print(f"RESULT:{json.dumps(result)}")

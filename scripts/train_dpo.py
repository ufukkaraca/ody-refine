#!/usr/bin/env python3
"""DPO fine-tuning with QLoRA. Core training script for Ody Forge."""

import argparse
import json
import logging
import sys
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, TaskType
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import DPOConfig, DPOTrainer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("ody-dpo")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Ody DPO training with QLoRA")
    p.add_argument("--dataset", required=True, help="Path to JSONL with prompt/chosen/rejected")
    p.add_argument("--base-model", default="Qwen/Qwen2.5-7B", help="HuggingFace model ID")
    p.add_argument("--output-dir", default="./output-dpo", help="Directory for adapter weights")
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--batch-size", type=int, default=4)
    p.add_argument("--lr", type=float, default=5e-5)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--max-length", type=int, default=1024)
    p.add_argument("--max-prompt-length", type=int, default=512)
    p.add_argument("--beta", type=float, default=0.1, help="DPO beta parameter")
    p.add_argument("--no-quantize", action="store_true", help="Disable 4-bit quantization")
    return p.parse_args()


def validate_dataset(path: str) -> Path:
    p = Path(path)
    if not p.exists():
        log.error("Dataset not found: %s", path)
        sys.exit(1)
    if p.suffix not in (".jsonl", ".json"):
        log.error("Expected .jsonl or .json file, got: %s", p.suffix)
        sys.exit(1)
    return p


def check_gpu() -> torch.device:
    if torch.cuda.is_available():
        dev = torch.device("cuda")
        log.info("GPU: %s (%d MB)", torch.cuda.get_device_name(0), torch.cuda.get_device_properties(0).total_mem // 1048576)
        return dev
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        log.info("Using Apple MPS backend")
        return torch.device("mps")
    log.warning("No GPU detected — training will be slow")
    return torch.device("cpu")


def main() -> None:
    args = parse_args()
    dataset_path = validate_dataset(args.dataset)
    device = check_gpu()
    use_quantization = not args.no_quantize and device.type == "cuda"

    log.info("Base model: %s", args.base_model)
    log.info("Dataset: %s", dataset_path)
    log.info("QLoRA: %s | LoRA r=%d alpha=%d", use_quantization, args.lora_r, args.lora_alpha)

    # Load dataset and validate columns
    ds = load_dataset("json", data_files=str(dataset_path), split="train")
    required = {"prompt", "chosen", "rejected"}
    missing = required - set(ds.column_names)
    if missing:
        log.error("Dataset missing columns: %s (required: %s)", missing, required)
        sys.exit(1)
    log.info("Dataset loaded: %d examples", len(ds))

    # 90/10 train/val split
    split = ds.train_test_split(test_size=0.1, seed=42)
    train_ds, val_ds = split["train"], split["test"]
    log.info("Train: %d | Validation: %d", len(train_ds), len(val_ds))

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Model with optional 4-bit quantization
    model_kwargs: dict = {"trust_remote_code": True}
    if use_quantization:
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )
        model_kwargs["torch_dtype"] = torch.bfloat16
    elif device.type == "mps":
        model_kwargs["torch_dtype"] = torch.float16
    else:
        model_kwargs["torch_dtype"] = torch.float32

    log.info("Loading model...")
    model = AutoModelForCausalLM.from_pretrained(args.base_model, **model_kwargs)

    # LoRA config
    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        task_type=TaskType.CAUSAL_LM,
    )

    # DPO training config
    training_args = DPOConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch",
        beta=args.beta,
        max_length=args.max_length,
        max_prompt_length=args.max_prompt_length,
        bf16=use_quantization or (device.type == "cuda" and torch.cuda.is_bf16_supported()),
        fp16=device.type == "mps",
        gradient_checkpointing=True,
        remove_unused_columns=False,
        report_to="none",
    )

    log.info("Starting DPO training...")
    trainer = DPOTrainer(
        model=model,
        ref_model=None,  # PEFT handles implicit reference
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        peft_config=peft_config,
    )

    result = trainer.train()

    # Save adapter + tokenizer
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    log.info("Adapter saved to %s", args.output_dir)

    # Summary
    summary = {
        "status": "complete",
        "output_dir": str(Path(args.output_dir).resolve()),
        "base_model": args.base_model,
        "method": "dpo",
        "epochs": args.epochs,
        "train_samples": len(train_ds),
        "val_samples": len(val_ds),
        "final_loss": round(result.training_loss, 4),
    }
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

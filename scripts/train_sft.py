#!/usr/bin/env python3
"""SFT fine-tuning with QLoRA. Instruction-tuning script for Ody Forge."""

import argparse
import json
import logging
import sys
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, TaskType
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("ody-sft")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Ody SFT training with QLoRA")
    p.add_argument("--dataset", required=True, help="Path to JSONL with instruction/response")
    p.add_argument("--base-model", default="Qwen/Qwen2.5-7B", help="HuggingFace model ID")
    p.add_argument("--output-dir", default="./output-sft", help="Directory for adapter weights")
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--batch-size", type=int, default=4)
    p.add_argument("--lr", type=float, default=2e-5)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--max-seq-length", type=int, default=1024)
    p.add_argument("--no-quantize", action="store_true", help="Disable 4-bit quantization")
    return p.parse_args()


def check_gpu() -> torch.device:
    if torch.cuda.is_available():
        log.info("GPU: %s", torch.cuda.get_device_name(0))
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        log.info("Using Apple MPS backend")
        return torch.device("mps")
    log.warning("No GPU detected — training will be slow")
    return torch.device("cpu")


def format_chat(example: dict) -> dict:
    """Format instruction/response into a chat template."""
    text = f"<|user|>\n{example['instruction']}\n<|assistant|>\n{example['response']}"
    return {"text": text}


def main() -> None:
    args = parse_args()
    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        log.error("Dataset not found: %s", args.dataset)
        sys.exit(1)

    device = check_gpu()
    use_quantization = not args.no_quantize and device.type == "cuda"

    log.info("Base model: %s", args.base_model)
    log.info("Dataset: %s", dataset_path)

    # Load and validate
    ds = load_dataset("json", data_files=str(dataset_path), split="train")
    required = {"instruction", "response"}
    missing = required - set(ds.column_names)
    if missing:
        log.error("Dataset missing columns: %s (required: %s)", missing, required)
        sys.exit(1)

    ds = ds.map(format_chat, remove_columns=ds.column_names)
    split = ds.train_test_split(test_size=0.1, seed=42)
    train_ds, val_ds = split["train"], split["test"]
    log.info("Train: %d | Validation: %d", len(train_ds), len(val_ds))

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Model
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

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        task_type=TaskType.CAUSAL_LM,
    )

    training_args = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch",
        max_seq_length=args.max_seq_length,
        bf16=use_quantization or (device.type == "cuda" and torch.cuda.is_bf16_supported()),
        fp16=device.type == "mps",
        gradient_checkpointing=True,
        report_to="none",
        dataset_text_field="text",
    )

    log.info("Starting SFT training...")
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        peft_config=peft_config,
    )

    result = trainer.train()

    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    log.info("Adapter saved to %s", args.output_dir)

    summary = {
        "status": "complete",
        "output_dir": str(Path(args.output_dir).resolve()),
        "base_model": args.base_model,
        "method": "sft",
        "epochs": args.epochs,
        "train_samples": len(train_ds),
        "val_samples": len(val_ds),
        "final_loss": round(result.training_loss, 4),
    }
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

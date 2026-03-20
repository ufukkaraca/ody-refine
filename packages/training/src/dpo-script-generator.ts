/**
 * Python training script generators for DPO (Direct Preference Optimization).
 * @module training/dpo-script-generator
 */

/** Generate the DPO import/config body. */
export function generateDpoBody(
  model: string, lr: number, epochs: number, batchSize: number, warmupSteps: number,
): string {
  return [
    'from transformers import AutoModelForCausalLM, AutoTokenizer',
    'from trl import DPOTrainer, DPOConfig',
    'from peft import LoraConfig, get_peft_model',
    '',
    `MODEL_NAME = "${model}"`,
    `LEARNING_RATE = ${lr}`,
    `NUM_EPOCHS = ${epochs}`,
    `BATCH_SIZE = ${batchSize}`,
    `WARMUP_STEPS = ${warmupSteps}`,
    'MAX_LENGTH = 1024',
    '',
  ].join('\n');
}

/** Generate the DPO training call. */
export function generateDpoTrainCall(): string {
  return [
    '',
    'dataset = load_dataset("json", data_files=dataset_path, split="train")',
    '',
    '# Validate dataset columns',
    'required_columns = {"prompt", "chosen", "rejected"}',
    'missing = required_columns - set(dataset.column_names)',
    'if missing:',
    '    raise ValueError(f"Dataset missing required columns: {missing}. Expected: {required_columns}")',
    '',
    'tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)',
    'if tokenizer.pad_token is None:',
    '    tokenizer.pad_token = tokenizer.eos_token',
    '',
    'model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)',
    '',
    '# LoRA config — passed to DPOTrainer which handles ref model implicitly',
    'peft_config = LoraConfig(',
    '    r=16,',
    '    lora_alpha=32,',
    '    lora_dropout=0.05,',
    '    target_modules=["q_proj", "v_proj"],',
    '    task_type="CAUSAL_LM",',
    ')',
    '',
    'training_args = DPOConfig(',
    '    output_dir=OUTPUT_DIR,',
    '    num_train_epochs=NUM_EPOCHS,',
    '    per_device_train_batch_size=BATCH_SIZE,',
    '    learning_rate=LEARNING_RATE,',
    '    warmup_steps=WARMUP_STEPS,',
    '    logging_steps=10,',
    '    save_strategy="epoch",',
    '    beta=0.1,',
    '    max_length=MAX_LENGTH,',
    '    gradient_checkpointing=False,',
    '    report_to="none",',
    ')',
    '',
    '# ref_model=None: PEFT handles implicit reference via frozen base weights',
    'trainer = DPOTrainer(',
    '    model=model,',
    '    ref_model=None,',
    '    processing_class=tokenizer,',
    '    args=training_args,',
    '    train_dataset=dataset,',
    '    peft_config=peft_config,',
    ')',
    '',
    'trainer.train()',
    'model.save_pretrained(OUTPUT_DIR)',
    'tokenizer.save_pretrained(OUTPUT_DIR)',
    '',
    '# Emit artifact metadata for model-loader',
    'import datetime',
    'meta = {"modelPath": OUTPUT_DIR, "baseModel": MODEL_NAME, "method": "dpo", "timestamp": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z")}',
    'Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)',
    'with open(str(Path(OUTPUT_DIR) / "artifact-meta.json"), "w") as f:',
    '    json.dump(meta, f, indent=2)',
    'print("DPO training complete")',
    '',
  ].join('\n');
}

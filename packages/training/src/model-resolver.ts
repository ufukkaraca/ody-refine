/**
 * Resolves Ollama model tags to HuggingFace model IDs for training.
 * Ollama uses tags like "llama3.2:3b" while HuggingFace uses "meta-llama/Llama-3.2-3B".
 * @module training/model-resolver
 */

/** Known mappings from Ollama model tags to HuggingFace model IDs. */
const OLLAMA_TO_HF: Record<string, string> = {
  // Llama 3.2 family
  'llama3.2:1b': 'meta-llama/Llama-3.2-1B',
  'llama3.2:3b': 'meta-llama/Llama-3.2-3B',
  // Llama 3.1 family
  'llama3.1:8b': 'meta-llama/Llama-3.1-8B',
  'llama3.1:70b': 'meta-llama/Llama-3.1-70B',
  // Qwen 2.5 family (freely accessible, no gating)
  'qwen2.5:0.5b': 'Qwen/Qwen2.5-0.5B',
  'qwen2.5:1.5b': 'Qwen/Qwen2.5-1.5B',
  'qwen2.5:3b': 'Qwen/Qwen2.5-3B',
  'qwen2.5:7b': 'Qwen/Qwen2.5-7B',
  'qwen2.5:14b': 'Qwen/Qwen2.5-14B',
  'qwen2.5:32b': 'Qwen/Qwen2.5-32B',
  // Gemma 2 family
  'gemma2:2b': 'google/gemma-2-2b',
  'gemma2:9b': 'google/gemma-2-9b',
  // Phi family
  'phi3:mini': 'microsoft/Phi-3-mini-4k-instruct',
  'phi3.5:3.8b': 'microsoft/Phi-3.5-mini-instruct',
  // Mistral family
  'mistral:7b': 'mistralai/Mistral-7B-v0.3',
};

/**
 * Check if a model name looks like an Ollama tag (contains a colon).
 * HuggingFace model IDs use slashes (org/model) while Ollama uses colons (name:size).
 */
export function isOllamaTag(modelName: string): boolean {
  return modelName.includes(':') && !modelName.includes('/');
}

/**
 * Resolve a model name to a HuggingFace model ID.
 * If the name is already a HuggingFace ID (contains '/'), returns it as-is.
 * If it's an Ollama tag, looks it up in the mapping.
 * Returns null if the Ollama tag is unknown.
 */
export function resolveToHuggingFace(modelName: string): string | null {
  if (modelName.includes('/')) {
    return modelName;
  }
  const normalized = modelName.toLowerCase();
  return OLLAMA_TO_HF[normalized] ?? null;
}

/**
 * Resolve a model name to a HuggingFace ID, throwing if unknown.
 * This is the primary entry point for the training pipeline.
 */
export function resolveModelForTraining(modelName: string): string {
  const resolved = resolveToHuggingFace(modelName);
  if (resolved) return resolved;

  if (isOllamaTag(modelName)) {
    throw new Error(
      `Unknown Ollama model tag "${modelName}". ` +
      `Known tags: ${Object.keys(OLLAMA_TO_HF).join(', ')}. ` +
      `Use a HuggingFace model ID (e.g., "Qwen/Qwen2.5-0.5B") instead.`,
    );
  }

  // Might be a local path or bare HF name — pass through
  return modelName;
}

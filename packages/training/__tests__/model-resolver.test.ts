import { describe, it, expect } from 'vitest';
import {
  resolveModelForTraining,
  resolveToHuggingFace,
  isOllamaTag,
} from '../src/model-resolver.js';

describe('model-resolver', () => {
  describe('isOllamaTag', () => {
    it('identifies Ollama-style tags with colons', () => {
      expect(isOllamaTag('llama3.2:3b')).toBe(true);
      expect(isOllamaTag('qwen2.5:7b')).toBe(true);
      expect(isOllamaTag('mistral:7b')).toBe(true);
    });

    it('rejects HuggingFace-style IDs with slashes', () => {
      expect(isOllamaTag('meta-llama/Llama-3.2-3B')).toBe(false);
      expect(isOllamaTag('Qwen/Qwen2.5-7B')).toBe(false);
    });

    it('rejects plain model names without colons', () => {
      expect(isOllamaTag('test-model')).toBe(false);
      expect(isOllamaTag('my-custom-model')).toBe(false);
    });
  });

  describe('resolveToHuggingFace', () => {
    it('resolves known Ollama tags to HF IDs', () => {
      expect(resolveToHuggingFace('llama3.2:3b')).toBe('meta-llama/Llama-3.2-3B');
      expect(resolveToHuggingFace('qwen2.5:7b')).toBe('Qwen/Qwen2.5-7B');
      expect(resolveToHuggingFace('qwen2.5:0.5b')).toBe('Qwen/Qwen2.5-0.5B');
    });

    it('passes through HuggingFace IDs as-is', () => {
      expect(resolveToHuggingFace('meta-llama/Llama-3.2-3B')).toBe('meta-llama/Llama-3.2-3B');
      expect(resolveToHuggingFace('Qwen/Qwen2.5-7B')).toBe('Qwen/Qwen2.5-7B');
    });

    it('returns null for unknown Ollama tags', () => {
      expect(resolveToHuggingFace('unknown-model:99b')).toBeNull();
    });

    it('is case-insensitive for Ollama tags', () => {
      expect(resolveToHuggingFace('Llama3.2:3b')).toBe('meta-llama/Llama-3.2-3B');
      expect(resolveToHuggingFace('QWEN2.5:7B')).toBe('Qwen/Qwen2.5-7B');
    });
  });

  describe('resolveModelForTraining', () => {
    it('resolves known Ollama tags', () => {
      expect(resolveModelForTraining('llama3.2:3b')).toBe('meta-llama/Llama-3.2-3B');
    });

    it('passes through HuggingFace IDs', () => {
      expect(resolveModelForTraining('meta-llama/Llama-3.2-3B')).toBe('meta-llama/Llama-3.2-3B');
    });

    it('passes through plain model names (might be local paths)', () => {
      expect(resolveModelForTraining('test-model')).toBe('test-model');
    });

    it('throws for unknown Ollama tags', () => {
      expect(() => resolveModelForTraining('fake-model:99b')).toThrow('Unknown Ollama model tag');
    });
  });
});

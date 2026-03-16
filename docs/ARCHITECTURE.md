# Architecture

## Module Boundaries

The codebase enforces strict import boundaries via ESLint:

```
packages/core        → NO external dependencies (pure TS)
packages/orchestrator → uses core interfaces only
packages/providers   → implements core interfaces with SDKs
packages/db          → uses core + Drizzle ORM
apps/*              → can import any package
```

### Core (`packages/core`)

**Zero vendor dependencies.** Contains:
- Domain entities: `Vault`, `Reserve`, `Swap`, `Safe`, `User`
- Provider interfaces: `LLMProvider`, `EmbeddingProvider`, `VectorStore`, `STTProvider`, `TTSProvider`
- Policies: confidence calculation, swap creation rules

### Orchestrator (`packages/orchestrator`)

Use-cases that coordinate domain logic:
- `askQuestion()` - retrieve + generate answer with sources
- `distillMemory()` - extract knowledge from conversations
- `createSafe()` / `refreshSafe()` - generate static docs
- `getMindView()` - build graph data for visualization

### Providers (`packages/providers`)

Adapters implementing core interfaces:
- **LLM**: OpenRouter (any model), Fake (testing)
- **Embedding**: OpenRouter/OpenAI, Fake
- **Vector**: pgvector (Postgres)
- **STT/TTS**: Fake (real adapters pending credentials)

### DB (`packages/db`)

Drizzle ORM with pgvector:
- Schema definitions with typed JSONB columns
- Repository layer for each entity
- Audit event persistence

## Data Flow

```
User Question
    ↓
[Chat API Route]
    ↓
askQuestion(llm, embedding, vectorStore)
    ↓
1. Embed question
2. Vector search reserves
3. Expand via swaps
4. Generate answer (LLM)
5. Calculate confidence
6. Return with sources
    ↓
[Frontend renders answer + sources]
```

## Swapping Providers

All providers are injected via dependency injection:

```typescript
// Use real OpenRouter
const llm = new OpenRouterLLMProvider(apiKey, 'anthropic/claude-3.5-sonnet');

// Or use fake for testing
const llm = new FakeLLMProvider();

// Pass to use-case
const result = await askQuestion({ llm, embedding, vectorStore, ... }, input);
```

To add a new provider:
1. Implement the interface from `@ody/core`
2. Add to `packages/providers`
3. Update factory or DI container

## Local Model Path

The architecture supports local models:
1. Implement `LLMProvider` for Ollama/llama.cpp
2. Implement `EmbeddingProvider` for local embeddings
3. No changes needed to orchestrator or core

# Ody Forge — Reinforcement Learning Specification

> Author: Richard (RL Orchestrator)
> Date: 2026-03-15
> Status: Foundational analysis — determines whether Forge is a real ML product or scaffolding

---

## 1. The RL Environment, Formally

The Ody flywheel contains **two distinct RL problems** operating on different timescales. Conflating them is the most common error in systems like this. I will define both.

### 1.1 Problem A: Response Quality (Fast Loop)

This is the standard RLHF/DPO problem: make the domain model give better answers.

**State (s_t):**
At conversation turn t, the state is the tuple:

```
s_t = (conversation_history, retrieved_context, user_profile)
```

Where:
- `conversation_history`: The sequence of (user, assistant) message pairs up to turn t
- `retrieved_context`: The set of KnowledgeNodes returned by RAG for the current query, including their content, confidence scores, and source references
- `user_profile`: The user's reputation score and signal history (determines how much we trust their corrections)

The state is fully observable to the model at generation time. There is no hidden state — the model sees everything it needs.

**Action (a_t):**
The model's action is its generated response — a string. But structurally, the action decomposes into:

```
a_t = (response_text, cited_sources[], expressed_confidence)
```

The action space is the full token vocabulary at each decoding step. DPO/GRPO operate over complete response-level actions, not token-level.

**Reward (r_t):**
The reward arrives asynchronously, after the user interacts with the response:

| Signal | Reward | Latency | Notes |
|--------|--------|---------|-------|
| accepted | +0.3 × reputation | ~60s timeout | Implicit — no follow-up within window |
| shared | +0.8 × reputation | Variable | Strongest positive signal |
| follow_up | +0.1 × reputation | <60s | Neutral — ambiguous intent |
| escalated | −0.5 × reputation | Variable | User gave up on the model |
| rejected | −0.6 × reputation | <10s | User rephrased immediately |
| corrected | −0.9 × reputation + correction_data | Variable | Strongest negative signal, but also most valuable data |

**Critical observation:** The correction signal is simultaneously the worst reward AND the most valuable training datum. A correction with `reputation >= 0.8` produces a preference pair `(chosen=correction, rejected=original_response)` that directly improves the model. This is the system's primary learning mechanism.

**Return (G_t):**
Each conversation is an **episode**. The return for a conversation of T turns is:

```
G = Σ_{t=0}^{T} γ^t × r_t
```

**I recommend γ = 1.0 (undiscounted, episodic).** Rationale: conversations are short (typically 3-8 turns). Discounting would underweight later turns, but in knowledge Q&A, later turns are often MORE important — they represent the user drilling down to verify the model's accuracy. Undiscounted episodic returns avoid this bias.

**Policy (π):**
The policy is the LLM's conditional generation distribution:

```
π(a_t | s_t) = P(response | conversation_history, retrieved_context, user_profile; θ)
```

Where θ are the model weights (base + LoRA adapter). Training updates θ to maximize expected return.

**Value Function V(s):**
In this domain, the value function estimates: "given this conversation state, how much reward can we expect from here?" This is useful conceptually but we do NOT need to learn it explicitly. DPO and GRPO operate without value function estimation — they work directly on preference pairs or reward-weighted samples. This is the right choice for Ody: the reward signal is too sparse and delayed for stable value function learning.

### 1.2 Problem B: Knowledge Quality (Slow Loop)

This is the less obvious but more important RL problem: learning which knowledge to trust, what to surface, and when knowledge is stale.

**State:** The full knowledge graph — all nodes, edges, confidence scores, last-verified dates.

**Action:** The system's curation decisions:
- Which nodes to surface for a given query
- How to rank contradicting sources
- When to flag staleness
- When to trigger re-ingestion

**Reward:** Aggregate conversation outcomes over time. If a knowledge node is consistently cited in responses that get `accepted`/`shared`, its confidence should increase. If it's cited in `rejected`/`corrected` responses, its confidence should decrease.

**Timescale:** This loop operates over weeks/months, not turns. It is NOT trained via gradient descent — it updates node confidence scores and edge weights in the knowledge graph. Think of it as a non-parametric learning system.

**I recommend NOT implementing Problem B as explicit RL in Phase 2.** Instead, implement it as heuristic confidence updates:
- Node cited in accepted response → confidence += 0.01
- Node cited in corrected response → confidence -= 0.05
- Node not cited in 30 days → confidence *= 0.95 (decay)

This is simpler, more interpretable, and achieves 80% of the benefit. True RL for knowledge curation is a Phase 4+ research project.

---

## 2. Critique of the Current Training Pipeline

### 2.1 DPO Script: Structurally Broken

The generated DPO script in `packages/training/src/training-config.ts` has **five critical issues** that would prevent a real training run.

**Issue 1: Wrong config class**
```python
# Current (BROKEN):
training_args = TrainingArguments(...)
trainer = DPOTrainer(..., args=training_args, beta=0.1)

# Correct:
from trl import DPOConfig
training_args = DPOConfig(..., beta=0.1)
trainer = DPOTrainer(..., args=training_args)
```
TRL's `DPOTrainer` expects `DPOConfig`, not `TrainingArguments`. Passing `beta` as a kwarg to the trainer constructor was supported in TRL <0.8 but is deprecated/removed. The `DPOConfig` class extends `TrainingArguments` and adds DPO-specific parameters (`beta`, `loss_type`, `reference_free`, etc.).

**Issue 2: No LoRA — will OOM on any real model**
Loading TWO full copies of the model (`model` + `ref_model`) requires double VRAM. For a 7B model, that's ~28GB in float16 — already at the limit of a single A100. For 13B+, it's impossible without LoRA.

Fix: Use PEFT LoRA adapters. The `ref_model` stays frozen at full precision, and only the LoRA adapter is trained. This is standard practice.

```python
from peft import LoraConfig, get_peft_model

peft_config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, peft_config)
# ref_model stays as-is (frozen base)
```

**Issue 3: Dataset column mapping not specified**
TRL's DPOTrainer expects columns named `prompt`, `chosen`, `rejected`. The `PreferencePair` type in `packages/core/src/types.ts` uses exactly these field names, so the JSONL export *should* work — but the script doesn't validate this or transform columns. If the export format changes, training silently fails or produces garbage.

Fix: Add explicit column mapping and validation.

**Issue 4: No tokenization config**
The script doesn't set:
- `max_length` / `max_prompt_length` — DPO requires bounded sequence lengths
- `padding` / `truncation` strategy
- `chat_template` — critical for instruction-tuned models

Without these, the tokenizer defaults may truncate important context or pad incorrectly.

**Issue 5: GRPO not implemented**
`TrainingConfig.method` accepts `'grpo'` but falls back to SFT. GRPO (Group Relative Policy Optimization) is actually the most promising method for Ody because it doesn't require a reference model — it uses group-level reward comparisons. For small datasets with noisy rewards (exactly Ody's situation), GRPO is more stable than DPO.

### 2.2 SFT Script: Data Format Mismatch

The SFT script maps data to `instruction`/`response` format:
```python
dataset.map(lambda x: {"text": f"### Instruction:\n{x['instruction']}\n\n### Response:\n{x['response']}"})
```

But the exported data from Refine produces `KnowledgeNode` objects with `title`, `content.summary`, `content.facts` — there is no `instruction`/`response` mapping. The SFT script would fail at this `.map()` call because the columns don't exist.

Fix: Define a clear SFT data format, either:
- Transform knowledge nodes into Q&A pairs during export (e.g., `instruction = "What do you know about {title}?"`, `response = summary + facts`)
- Or use the benchmark generation logic from `packages/eval/src/benchmark.ts` which already does this

### 2.3 Preference Pair Quality: Insufficient Context

The current `derivePreferencePair` function in `packages/feedback/src/reward-derivation.ts` produces:

```typescript
{
  prompt: `Question about nodes: ${signal.questionNodeIds.join(', ')}`,  // ← UUIDs!
  chosen: correctedText,
  rejected: originalAnswer,
}
```

The prompt field contains **node UUIDs**, not the actual question or context. This makes the preference pair nearly useless for training — the model learns "for this opaque identifier, prefer response A over B" rather than "for this type of question in this domain, prefer this style of answer."

**Fix:** The prompt must contain the actual user question, the relevant knowledge context, and ideally the system instructions that were active at generation time. The preference pair should reconstruct the full input that produced the rejected response.

### 2.4 Eval Metrics: Too Coarse

The eval system has four metrics: `accuracy` (keyword overlap), `semanticSimilarity` (deferred — uses accuracy as proxy), `contradictionRate` (negation heuristic), `avgConfidence` (uses accuracy as proxy).

**Two of four metrics are proxies for the same thing.** `avgConfidence` = `accuracy` and `semanticSimilarity` = `accuracy`. Effectively, the eval gate checks one real metric (keyword overlap accuracy) and one heuristic (negation-word contradiction detection). This is not sufficient to gate model deployment.

Missing metrics:
- **Factual consistency** — does the response contain facts not in the source material? (hallucination detection)
- **Source attribution** — does the model correctly cite its sources?
- **Domain coverage** — does the model handle all domains equally, or does it regress on some while improving on others?
- **Response quality** — fluency, coherence, appropriate length

The `calculateAccuracy` function uses keyword overlap, which is a poor proxy for semantic correctness. "The deployment deadline is Q3" and "The Q3 milestone was postponed" share keywords but have opposite meanings.

---

## 3. Continuous Improvement Loop Design

### 3.1 The Missing Orchestrator

The current codebase has:
- `SignalCollector` — records signals to SQLite ✓
- `deriveReward` — scores signals ✓
- `derivePreferencePair` — creates preference pairs from corrections ✓
- `ReputationTracker` — weights user corrections ✓
- `DatasetRegistry` — versions datasets ✓
- `ModelRegistry` — tracks models ✓
- `evaluateGate` — pass/fail model promotion ✓
- `LocalTrainer` — runs Python training ✓

**What's missing: the thing that connects them.** There is no orchestrator, no scheduler, no trigger mechanism. The pieces are isolated functions that nothing calls in sequence. The flywheel has gears but no chain.

### 3.2 Retraining Trigger Design

**When to retrain:**

The trigger should be based on **expected improvement**, not just pair count. A model trained on 200 high-confidence pairs from trusted users is more valuable than 1000 low-confidence pairs from new users.

```
trigger_score = Σ (pair_confidence × reputation_weight × recency_factor)
```

Where:
- `pair_confidence` = the confidence field from `PreferencePair.metadata`
- `reputation_weight` = the corrector's reputation score
- `recency_factor` = exponential decay from creation time (half-life: 7 days)

**Trigger threshold:** Retrain when `trigger_score >= 50.0`. This roughly corresponds to:
- ~60 high-confidence pairs from trusted users, OR
- ~120 medium-confidence pairs from normal users, OR
- Some mix

**Cooldown:** Minimum 24 hours between training runs. Training is expensive; we don't want to trigger on every batch of corrections.

**Schedule check:** A background job runs every 6 hours:
1. Count new preference pairs since last training run
2. Compute trigger_score
3. If threshold met and cooldown elapsed → start retraining pipeline

### 3.3 The Retraining Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    RETRAINING PIPELINE                          │
│                                                                 │
│  1. SNAPSHOT                                                    │
│     └─ Create new DatasetVersion from:                         │
│        - All knowledge nodes (for SFT base)                    │
│        - All preference pairs since last dataset (for DPO)     │
│        - Previous dataset's pairs (replay buffer)              │
│        - Hold-out eval set (from benchmark generation)         │
│                                                                 │
│  2. TRAIN                                                       │
│     └─ Stage 1: SFT on knowledge Q&A pairs (if first run)     │
│     └─ Stage 2: DPO on preference pairs (incremental)         │
│        - LoRA adapter on frozen base                           │
│        - Include 20% replay from previous dataset              │
│                                                                 │
│  3. EVALUATE                                                    │
│     └─ Run full benchmark suite against candidate model        │
│     └─ Run full benchmark suite against current deployed model │
│     └─ Compare on ALL metrics                                  │
│                                                                 │
│  4. GATE                                                        │
│     └─ evaluateGate(current_eval, candidate_eval)              │
│     └─ HARD gate: candidate must be >= current on ALL metrics  │
│     └─ No auto-override. Admin can force with --force flag.    │
│                                                                 │
│  5. DEPLOY (if gate passes)                                     │
│     └─ Register model in ModelRegistry                         │
│     └─ Update status: ready → deployed                         │
│     └─ Previous model: deployed → retired                      │
│     └─ New conversations use new model                         │
│     └─ Existing conversations pinned to old model              │
│                                                                 │
│  6. RECORD                                                      │
│     └─ Log the full lineage:                                   │
│        dataset_version → training_run → eval_result → model    │
│     └─ Store all artifacts for reproducibility                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Catastrophic Forgetting

This is the central risk. When the model trains on new preference pairs about topic X, it may degrade on topics Y and Z that it previously handled well. Three defense layers:

**Layer 1: LoRA adapters (architectural)**
Never fine-tune the full base model. Train LoRA adapters only. The base model's general capabilities remain frozen. This is the single most important mitigation — it bounds the maximum forgetting to the LoRA rank.

**Layer 2: Replay buffer (data-level)**
Every training run includes 20% of preference pairs from the previous dataset version. This forces the model to maintain performance on previously learned material. The replay fraction should increase if we detect forgetting.

Implementation: `DatasetVersion.lineage.parentVersionId` already tracks the chain. When building a new dataset, sample from the parent's pairs.

**Layer 3: Per-domain eval (evaluation-level)**
The current eval gate checks aggregate metrics. It should ALSO check per-domain metrics. If the model improves on "engineering" topics but regresses on "compliance" topics, the gate should flag this even if the aggregate score improves.

This requires the benchmark to be tagged by domain (it already is — `EvalItem.domain` exists). The gate should check:
```
for each domain d:
  candidate.scores[d].accuracy >= current.scores[d].accuracy - tolerance
```

With `tolerance = 0.05` (5% per-domain regression allowed if aggregate improves).

### 3.5 Exploration vs. Exploitation

Standard RL wisdom says: sometimes take suboptimal actions to learn. In a production knowledge assistant, this is dangerous — giving a deliberately uncertain answer to "learn" can erode user trust.

**My recommendation: NO active exploration in production.** Instead:

1. **Passive exploration via model uncertainty.** When the model is uncertain (multiple conflicting sources, low-confidence nodes), it should say so honestly. This naturally generates informative signals — users who correct uncertain answers provide the highest-value preference pairs.

2. **A/B testing for exploration.** When a new model candidate passes the eval gate but barely, deploy it to 10% of new conversations (not 100%). Compare signal distributions between the two cohorts. This is controlled exploration without risking the majority of users.

3. **Sim-based exploration.** Use Ody Sim to generate synthetic conversations and test alternative response strategies offline. This is risk-free exploration.

---

## 4. Implementation Plan

### 4.1 packages/training/ — Required Changes

**File: `training-config.ts` — Rewrite DPO script generation**

```typescript
// Changes needed:
// 1. Import DPOConfig instead of TrainingArguments for DPO
// 2. Add PEFT/LoRA configuration
// 3. Add tokenization config (max_length, padding, truncation)
// 4. Add chat_template application
// 5. Add dataset validation step
// 6. Implement GRPO script generation
```

Specific fixes for `generateDpoTrainCall()`:
- Use `from trl import DPOConfig` instead of `TrainingArguments`
- Add `from peft import LoraConfig, get_peft_model`
- Set `max_length=1024`, `max_prompt_length=512`
- Add dataset schema validation before training
- Save LoRA adapter, not full model

**File: `training-config.ts` — Add GRPO support**

GRPO is better suited to Ody's data characteristics (small dataset, noisy rewards, no reference model needed). Add `generateGrpoBody()` and `generateGrpoTrainCall()`:

```python
from trl import GRPOTrainer, GRPOConfig

# GRPO uses a reward function, not preference pairs
# The reward function scores each response against ground truth
# Group size of 4-8 responses per prompt for relative ranking
```

**New file: `training-orchestrator.ts` — The missing orchestrator**

This is the most critical addition. It connects all the pieces:

```typescript
interface RetrainingOrchestrator {
  /** Check if retraining should be triggered. */
  shouldRetrain(): Promise<{ trigger: boolean; score: number; reason: string }>;

  /** Build a new dataset from accumulated pairs + replay buffer. */
  buildDataset(parentVersionId?: string): Promise<DatasetVersion>;

  /** Run the full pipeline: build → train → eval → gate → deploy. */
  runPipeline(): Promise<{
    datasetVersion: DatasetVersion;
    trainingRun: TrainingRun;
    evalResult: EvalResult;
    gateResult: EvalGateResult;
    deployed: boolean;
  }>;
}
```

This orchestrator:
1. Queries `interaction_signals` for new `corrected` signals since last training
2. Computes trigger score
3. Builds dataset with replay buffer from parent version
4. Calls `LocalTrainer.train()`
5. Runs `runBenchmark()` on candidate and current models
6. Calls `evaluateGate()`
7. If passed, updates `ModelRegistry`

**New file: `replay-buffer.ts` — Catastrophic forgetting protection**

```typescript
interface ReplayBuffer {
  /** Sample pairs from previous dataset versions. */
  sample(parentVersionId: string, fraction: number): Promise<PreferencePair[]>;

  /** Merge new pairs with replay pairs into a training dataset. */
  merge(newPairs: PreferencePair[], replayPairs: PreferencePair[]): PreferencePair[];
}
```

### 4.2 packages/eval/ — Required Changes

**File: `metrics.ts` — Replace proxy metrics**

Current: `semanticSimilarity` and `avgConfidence` are both proxies for `accuracy` (keyword overlap). This must be fixed.

1. `semanticSimilarity`: Must use actual embedding comparison. Accept an `EmbeddingProvider` and compute `cosineSimilarity(embed(expected), embed(actual))`. The function `calculateSemanticSimilarity` exists but is never called from `runBenchmark`.

2. `avgConfidence`: Should be extracted from the model's response, not computed from accuracy. Options:
   - Parse model's self-stated confidence ("I'm fairly confident that...")
   - Use token-level log probabilities if available
   - Use calibrated confidence from the response structure

3. Add `factualConsistency`: Check if the response introduces facts not present in the source material. This catches hallucinations.

**File: `eval-gate.ts` — Add per-domain regression checks**

```typescript
// Current: checks aggregate metrics only
// Needed: also check per-domain breakdowns

export function evaluateGate(
  current: EvalResult,
  candidate: EvalResult,
  domainTolerance?: number,  // default 0.05
): EvalGateResult {
  // ... existing aggregate checks ...

  // NEW: per-domain regression check
  const domainScores = groupByDomain(current.itemResults, candidate.itemResults);
  for (const [domain, scores] of domainScores) {
    if (scores.candidateAccuracy < scores.currentAccuracy - (domainTolerance ?? 0.05)) {
      regressions.push({
        metric: `accuracy:${domain}`,
        current: scores.currentAccuracy,
        candidate: scores.candidateAccuracy,
      });
    }
  }
}
```

**File: `runner.ts` — Add embedding-based similarity**

The runner currently sets `similarity: accuracy` with a comment "embedding-based similarity deferred to caller." This should be implemented:

```typescript
export async function runBenchmark(
  model: LLMProvider,
  benchmark: Benchmark,
  embedder?: EmbeddingProvider,  // optional, for semantic similarity
): Promise<EvalResult> {
  // ... for each item ...
  const similarity = embedder
    ? cosineSimilarity(
        await embedder.embed(item.expectedAnswer),
        await embedder.embed(modelAnswer),
      )
    : accuracy;  // fallback to keyword overlap
}
```

**File: `benchmark.ts` — Improve question generation**

Current benchmark generates questions like `"What do you know about: {title}?"`. This is too generic and doesn't test specific factual recall. Better:

```typescript
// For each fact in the node, generate a specific question:
// fact: "Deployment deadline is Q3 2026"
// question: "When is the deployment deadline?"
// expectedAnswer: "Q3 2026"
```

This requires an LLM call to generate questions from facts, or a template-based approach for common fact patterns.

### 4.3 packages/feedback/ — Required Changes

**File: `reward-derivation.ts` — Fix preference pair prompt**

The critical fix: the `prompt` field must contain the actual question, not node UUIDs.

```typescript
export function derivePreferencePair(
  signal: InteractionSignal,
  originalQuestion: string,      // NEW: the actual user question
  retrievedContext: string,       // NEW: the knowledge context shown to the model
  originalAnswer: string,
  correctedText: string,
  reputation: ReputationScore,
): PreferencePair | null {
  // ...
  return {
    prompt: originalQuestion,     // The actual question, not UUIDs
    chosen: correctedText,
    rejected: originalAnswer,
    metadata: {
      // ...
      retrievedContext,           // Store context for training reconstruction
    },
  };
}
```

**New file: `retraining-trigger.ts` — The trigger mechanism**

```typescript
export class RetrainingTrigger {
  /** Compute the trigger score from accumulated preference pairs. */
  computeScore(pairsSinceLastTraining: PreferencePair[]): number {
    return pairs.reduce((sum, pair) => {
      const recency = Math.exp(-daysSince(pair.metadata.resolvedAt) / 7);
      return sum + pair.metadata.confidence * recency;
    }, 0);
  }

  /** Check if retraining should be triggered. */
  shouldTrigger(score: number, lastTrainingAt: Date): {
    trigger: boolean;
    reason: string;
  } {
    const cooldownElapsed = hoursSince(lastTrainingAt) >= 24;
    if (!cooldownElapsed) return { trigger: false, reason: 'Cooldown not elapsed' };
    if (score < 50.0) return { trigger: false, reason: `Score ${score} < threshold 50` };
    return { trigger: true, reason: `Score ${score} >= threshold, cooldown elapsed` };
  }
}
```

**File: `reputation.ts` — Add domain-specific reputation**

The current reputation system treats all corrections equally. A user who is an expert in engineering should have higher reputation weight for engineering corrections than for compliance corrections.

This is a Phase 3 enhancement, but the data model should support it now:

```sql
-- Add to feedback schema:
CREATE TABLE IF NOT EXISTS domain_reputation (
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0.5,
  signal_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, domain)
);
```

---

## 5. Data Flow: End-to-End

```
REFINE (Phase 1)                    FORGE (Phase 2)                    COLLEAGUE (Phase 3)
─────────────────                   ────────────────                   ──────────────────

Docs ingested                       Dataset v1 created                 Model v1 deployed
    │                                   │                                  │
    ▼                                   ▼                                  ▼
KnowledgeNodes stored               SFT training on                    User asks question
    │                               knowledge Q&A pairs                    │
    ▼                                   │                                  ▼
Detectors find                          ▼                              Model generates
contradictions/etc.                 Model v1 trained                   response from
    │                                   │                              retrieved context
    ▼                                   ▼                                  │
User resolves conflicts             Eval gate:                             ▼
in TUI                              v1 vs baseline                     User reacts
    │                                   │                              (accept/reject/
    ▼                                   ▼                               correct/share)
PreferencePairs                     Gate passes →                          │
exported as JSONL                   deploy v1                              ▼
    │                                                                  InteractionSignal
    ▼                                                                  recorded
Forge ingests for                                                          │
training                                                                   ▼
                                                                       deriveReward()
                                                                           │
                                    ┌──────────────────────────────────────┘
                                    │
                                    ▼
                              If 'corrected' signal
                              with reputation >= 0.4:
                              derivePreferencePair()
                                    │
                                    ▼
                              PreferencePair stored
                                    │
                                    ▼
                              Trigger check (every 6h):
                              trigger_score >= 50?
                                    │
                              ┌─────┴─────┐
                              │ NO        │ YES
                              │ wait      │
                              └───────────┤
                                          ▼
                                    Build dataset v(N+1)
                                    = new pairs + 20% replay
                                          │
                                          ▼
                                    DPO training
                                    (LoRA adapter)
                                          │
                                          ▼
                                    Eval gate:
                                    v(N+1) vs v(N)
                                          │
                                    ┌─────┴─────┐
                                    │ FAIL      │ PASS
                                    │ keep v(N) │ deploy v(N+1)
                                    │ alert     │ retire v(N)
                                    └───────────┴──────────────►
                                                         │
                                                         ▼
                                                    New conversations
                                                    use v(N+1)
                                                         │
                                                         └──► (loop continues)
```

---

## 6. What to Build, In Order

### Phase 2 Sprint 3 (Forge MVP) — Training Pipeline

| Priority | File | What | Why |
|----------|------|------|-----|
| P0 | `training/training-config.ts` | Fix DPO script: DPOConfig, LoRA, tokenization, validation | Current script won't run |
| P0 | `training/training-config.ts` | Fix SFT script: correct data format mapping | Column names don't match |
| P1 | `training/training-orchestrator.ts` | NEW: pipeline orchestrator connecting all pieces | The flywheel needs a chain |
| P1 | `eval/metrics.ts` | Real semantic similarity via embeddings | 2 of 4 metrics are proxies |
| P1 | `eval/runner.ts` | Accept EmbeddingProvider for similarity | Enables real metric |
| P2 | `training/training-config.ts` | Add GRPO script generation | Better for small noisy datasets |
| P2 | `training/replay-buffer.ts` | NEW: replay sampling from parent datasets | Catastrophic forgetting defense |
| P2 | `eval/eval-gate.ts` | Per-domain regression checks | Catch targeted forgetting |

### Phase 3 Sprint 6 (Feedback Loop) — Closing the Loop

| Priority | File | What | Why |
|----------|------|------|-----|
| P0 | `feedback/reward-derivation.ts` | Fix prompt: actual question, not UUIDs | Current pairs are useless |
| P0 | `feedback/retraining-trigger.ts` | NEW: trigger score + cooldown logic | Nothing triggers retraining |
| P1 | `feedback/signal-collector.ts` | Store original question + context with signal | Needed for preference pair reconstruction |
| P1 | `eval/benchmark.ts` | Better question generation from facts | Current questions too generic |
| P2 | `feedback/reputation.ts` | Domain-specific reputation scores | More accurate correction weighting |
| P2 | `eval/eval-gate.ts` | A/B deploy support (10% rollout) | Controlled exploration |

---

## 7. Open Questions for the Team

1. **Base model selection.** The current system defaults to whatever `baseModel` string is passed. For domain-specific knowledge Q&A, I recommend starting with `Qwen/Qwen2.5-7B-Instruct` or `meta-llama/Llama-3.1-8B-Instruct`. The model must be small enough to train locally on a single GPU, and large enough to understand domain context. 7-8B is the sweet spot.

2. **Training compute.** The `LocalTrainer` spawns a Python process. This assumes the user has a GPU with sufficient VRAM. For the managed service (Forge-as-service), this needs to dispatch to a cloud GPU provider. The `provider: 'prime-intellect'` option exists in the config but has no implementation.

3. **How much data is enough?** DPO can work with as few as 500 high-quality preference pairs (see Zephyr-7B paper). SFT works with even less for domain adaptation. But the quality bar is high — garbage pairs produce garbage models. The reputation system is correctly designed to filter quality, but the preference pair format needs fixing (see Section 2.3).

4. **Correction conflict resolution.** `packages/feedback/src/conflict-detector.ts` finds contradicting corrections but doesn't resolve them. When two trusted users correct the same answer differently, which correction becomes the `chosen` response? Options:
   - Higher reputation wins
   - Both become separate preference pairs (model sees conflicting signal)
   - Queue for admin resolution (current behavior for low-reputation users)
   - I recommend: higher reputation wins, with the conflict logged for admin review.

5. **Eval benchmark staleness.** Benchmarks are generated from knowledge nodes at a point in time. As knowledge evolves, the benchmark becomes stale. The eval gate may be testing against outdated ground truth. Solution: regenerate benchmarks from the latest high-confidence nodes before each eval run, not just once.

---

## 8. Summary: Is This a Real RL System?

**Current state: No.** The current code is well-structured scaffolding. The types are correct, the interfaces are clean, the separation of concerns is good. But:

- The training scripts won't produce a working model
- The preference pairs contain UUIDs instead of real prompts
- Two of four eval metrics are proxies for the same thing
- Nothing connects the pieces into a loop
- There is no protection against catastrophic forgetting
- GRPO (the most suitable method) is not implemented

**Can it become one? Yes.** The architecture is sound. The fixes are specific and bounded:

1. Fix the training scripts (P0, ~2 days)
2. Fix preference pair format (P0, ~1 day)
3. Build the orchestrator (P1, ~3 days)
4. Fix eval metrics (P1, ~2 days)
5. Add replay buffer (P2, ~1 day)
6. Add per-domain eval (P2, ~1 day)

Total: ~10 engineering days to make Forge a real ML product.

The most important insight: **the flywheel's value is in the preference pairs, not the model.** The model is commodity (any 7B base works). The preference pairs — domain-specific, human-validated, reputation-weighted corrections — are the moat. Every fix should optimize for preference pair quality first, model training second.

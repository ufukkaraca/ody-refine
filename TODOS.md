# TODOS

## Detection

### Benchmark: LLM-augmented vs raw LLM vs current pipeline

**What:** Run all three detection approaches on the same frozen corpus, compare precision/recall/F1.

**Why:** Raw LLM already beat the current heuristic pipeline. Option C (LLM-augmented) must beat raw LLM to justify its existence. This benchmark is the decision gate for whether to pursue graph-based architecture later.

**Context:** CEO plan originally proposed graph-based detection rewrite. Eng review pivoted to Option C (LLM-augmented detection). If Option C doesn't beat raw LLM, the next step is either (a) invest harder in LLM prompting or (b) revisit graph approach with a prototype. The benchmark protocol should use the frozen test corpus from the sprint, with precision >= LLM baseline and recall >= current pipeline baseline as pass criteria.

**Effort:** M
**Priority:** P1
**Depends on:** Option C implementation being complete

## Documentation

### Clean out docs/ folder

**What:** Audit docs/, remove stale/outdated docs, ensure public docs only reference open-source Refine components.

**Why:** User-requested. Platform repo is Apache 2.0 — proprietary Forge/Colleague info should not be in public docs. Dashboard.sh references a missing colleague-integration-guide.md. Stale docs actively mislead.

**Context:** The docs/ folder at repo root likely contains references to Forge, Colleague, and internal architecture that shouldn't be in the open-source repo. Forge/Colleague deployment guides should live in their respective private repos (forge/ and colleague/). After cleanup, docs/ should only contain: Refine CLI usage, core library docs, contribution guide, and architecture overview for the open-source pieces.

**Effort:** S
**Priority:** P1
**Depends on:** None

### Write Forge → Colleague deployment guide (internal)

**What:** Write an internal deployment guide covering model format, Forge → Colleague deployment path, config, and rollback.

**Why:** Dashboard.sh references this doc but it doesn't exist. Day 0 pre-sprint will produce the raw knowledge of how deployment works. This guide formalizes it and prevents knowledge loss.

**Context:** This guide is proprietary — it should live in the forge/ or colleague/ private repo, NOT in the public platform/ repo. Covers: how Forge outputs a trained model, what format Colleague expects, how to swap models, how to rollback. Depends on Day 0 investigation revealing the actual deployment path.

**Effort:** S
**Priority:** P2
**Depends on:** Day 0 pre-sprint (verify Colleague deployment path)

## Completed

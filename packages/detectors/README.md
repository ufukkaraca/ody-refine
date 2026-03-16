# @useody/detectors

Five pure-function detectors for finding issues in documentation knowledge graphs.

## Detectors

| Detector | What it finds |
|----------|--------------|
| `detectContradictions` | Two documents disagree on the same fact |
| `detectDuplicates` | Same topic documented in multiple places |
| `detectStaleness` | Processes and commitments that went quiet |
| `detectUndocumented` | Decisions made in chat, never written down |
| `detectTimeBombs` | Deadlines and SLAs approaching with no action |

## Usage

```typescript
import { detectContradictions, detectStaleness } from '@useody/detectors';

// Each detector is a pure function: (nodes, edges, llm?) -> Detection[]
const results = await detectContradictions(nodes, edges, llm);
```

## Writing a custom detector

```typescript
import type { DetectorFn } from '@useody/platform-core';

const detectMyIssue: DetectorFn = async (nodes, edges, llm) => {
  return []; // Your detection logic
};

detectMyIssue.preFilter = { similarityThreshold: 0.6, topK: 10 };
```

## Design principles

- **Pure functions** — No I/O, no side effects, no database access
- **Optional LLM** — Every detector works in heuristic mode (no LLM) with lower accuracy
- **Pre-filters** — Each detector declares similarity thresholds to avoid brute-force comparison

Part of [ody-platform](https://github.com/rodyr/ody-platform). See the root [README](../../README.md) for setup.

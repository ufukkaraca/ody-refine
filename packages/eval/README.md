# @useody/eval

Benchmark generation and model evaluation for Ody's knowledge detection pipeline.

## What it does

- Corpus runner: precision/recall/F1 against ground-truth corpora
- Consistency measure: multi-run Jaccard similarity
- Speed benchmarks: wall-clock timing per document
- Preference pair validator: validates TRL DPO format
- Flywheel structural simulation: proves interfaces connect
- Eval gate: blocks model deployment on regression

## Usage

```typescript
import { evaluateGate, runCorpusBenchmark } from '@useody/eval';
```

## License

Apache-2.0

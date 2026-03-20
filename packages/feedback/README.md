# @useody/feedback

Interaction signal collection, reputation scoring, and reward derivation for the Ody continuous learning pipeline.

## Features

- **Signal collection** — thumbs up/down, corrections, Slack reactions
- **Reputation tracking** — per-source confidence scoring based on signal history
- **Reward derivation** — convert corrections into SFT/DPO training pairs
- **Conflict detection** — flag contradictory corrections before they enter training
- **Correction pipeline** — validate, process, and store user corrections

## Usage

```ts
import { SignalCollector, ReputationTracker, deriveReward } from '@useody/feedback';
```

## License

Apache-2.0

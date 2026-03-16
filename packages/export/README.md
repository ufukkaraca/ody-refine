# @useody/export

Export and reporting for Ody Refine. Generates self-contained HTML health reports and JSONL data exports.

## Exports

| Function | Output |
|----------|--------|
| `generateHtmlReport` | Self-contained HTML report with score, findings, and next steps |
| `exportNodesToJsonl` | Knowledge nodes as JSONL |
| `exportSftToJsonl` | Supervised fine-tuning format |
| `exportTrlDpoToJsonl` | TRL DPO training pairs |
| `exportPreferencePairsToJsonl` | Preference pair format |

## Usage

```typescript
import { generateHtmlReport, exportNodesToJsonl } from '@useody/export';

// HTML report
const html = generateHtmlReport(detections, { nodeCount: 186, durationMs: 2100 });

// JSONL export
const jsonl = exportNodesToJsonl(nodes, { format: 'jsonl' });
```

## HTML report features

- Executive summary with health score
- Grouped findings by type (contradictions, staleness, etc.)
- Claims comparison grid for contradictions
- Source file badges with links
- Share-ready snippet for Slack/email
- Fully self-contained — no external CSS/JS dependencies

Part of [ody-platform](https://github.com/rodyr/ody-platform). See the root [README](../../README.md) for setup.

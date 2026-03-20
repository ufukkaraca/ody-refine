# Acme Engineering Training Dataset

Training data for the "Acme Engineering" simulated company, designed to test the full Refine -> Forge -> Colleague cycle. Generated from the Acme demo org seed data in `ody/colleague/packages/db/src/demo/seed-audit-demo.ts`.

## Files

### `sft-pairs.jsonl` -- 100 SFT instruction/response pairs

Each line is a JSON object with `instruction` and `response` fields. These cover factual Q&A about Acme Engineering across all domains.

**Format:**
```json
{"instruction": "question about Acme", "response": "correct factual answer"}
```

**Domains covered:**
- Deployment process: deploy windows, approval flow, rollback, blue-green strategy, Friday ban
- Team structure and ownership: key people (Alex, Sarah, Tom, Maria, Jake), role transfers
- Customer SLAs and support: enterprise vs SMB tiers, escalation process, at-risk accounts (Globex)
- Data retention and privacy: 30/30/14 policy, GDPR handling, PII encryption
- Onboarding process: new hire checklist, buddy system, database access (Tom, not Jake)
- Tech stack and architecture: microservices on K8s, Next.js, React 19, Neon PostgreSQL, GraphQL
- Incident response: PagerDuty, weekly on-call rotation, 15-min escalation, Monday reviews
- HR policies: 20 vacation days, parental leave, remote work
- Product roadmap: Ody AI Assistant, CRM migration, GraphQL rollout
- Integration details: Slack, Notion, Jira, Salesforce, PagerDuty, GitHub Actions, Render
- Knowledge management: Safes, reserves, audits, contradictions, topic tracking
- Security: Better Auth, SOC 2 questionnaire, OpenClaw access policy

### `dpo-pairs.jsonl` -- 30 DPO preference pairs

Each line is a JSON object with `prompt`, `chosen` (correct), and `rejected` (plausible but wrong) fields. The rejected answers represent what a base model would hallucinate -- factually wrong for Acme specifically, typically reflecting outdated information that still appears in stale documentation.

**Format:**
```json
{"prompt": "question", "chosen": "correct answer", "rejected": "plausible but wrong answer"}
```

**Key contradiction themes in DPO pairs:**
- Friday deploy window (old) vs Tuesday-Thursday window (current)
- Auth0 (old) vs Better Auth (current)
- Jake (departed) vs Tom (current DB owner)
- 365-day retention (old) vs 30-day retention (current)
- REST /v1/ (deprecated) vs GraphQL (current)
- Monolith (old) vs microservices (current)
- Rolling deploy (old) vs blue-green (current)
- Daily on-call (old) vs weekly on-call (current)
- 15 vacation days (old) vs 20 vacation days (current)

### `eval-questions.jsonl` -- 20 evaluation questions with ground truth

Each line is a JSON object with `question`, `expected_answer`, and `key_facts` fields. Use these to compare base model vs trained model accuracy.

**Format:**
```json
{"question": "...", "expected_answer": "...", "key_facts": ["fact1", "fact2"]}
```

The `key_facts` array contains specific assertions that should appear in a correct answer. Score by checking how many key facts the model's answer includes.

## Seeded Contradictions

This dataset deliberately encodes five core contradictions that exist in the Acme demo org. These contradictions represent the gap between stale Notion documentation and recent Slack decisions:

| # | Topic | Stale (Notion) | Current (Slack) | Severity |
|---|-------|---------------|-----------------|----------|
| 1 | Deploy window | Friday 2-4pm | Tue-Thu 10am-2pm, Fri banned | Critical |
| 2 | Auth provider | Auth0 SSO | Better Auth with passkeys | Critical |
| 3 | DB onboarding owner | Jake | Tom Wilson (Jake departed) | Warning |
| 4 | Data retention | 365d delete / 90d logs / 30d backups | 30d / 30d / 14d | Critical |
| 5 | API interface | REST /v1/ | GraphQL (REST deprecated) | Critical |

Additional contradictions exist around architecture (monolith vs microservices), tech stack versions, on-call cadence, and release branching.

## How to Use

### For SFT fine-tuning (Refine)

```python
import json

pairs = []
with open("sft-pairs.jsonl") as f:
    for line in f:
        pairs.append(json.loads(line))

# Convert to your training format, e.g. for Axolotl:
# {"instruction": "...", "output": "..."}
```

### For DPO training (Forge)

```python
import json

dpo_data = []
with open("dpo-pairs.jsonl") as f:
    for line in f:
        dpo_data.append(json.loads(line))

# Each item has: prompt, chosen, rejected
```

### For evaluation

```python
import json

eval_qs = []
with open("eval-questions.jsonl") as f:
    for line in f:
        eval_qs.append(json.loads(line))

# Score: count how many key_facts appear in the model's response
for q in eval_qs:
    response = model.generate(q["question"])
    hits = sum(1 for fact in q["key_facts"] if fact.lower() in response.lower())
    score = hits / len(q["key_facts"])
```

## Source

Generated from the Acme demo org seed at:
- `ody/colleague/packages/db/src/demo/seed-audit-demo.ts`
- `ody/colleague/packages/db/src/seed.ts`

The seed data creates an organization with 5 users (Alex, Sarah, Jake, Maria, Tom), Notion-sourced reserves (structured docs), Slack-sourced reserves (real-time decisions), three Safes (Deployment, Security, Onboarding), knowledge topics, issues, and audit findings.

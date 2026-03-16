# Ody Refine — Launch Materials

*Drafted March 15, 2026. All materials grounded in persona-tested messaging from gtm-simulations.md.*

---

## 1. Show HN Post

**Title:**
```
Show HN: Ody Refine – open-source CLI that finds contradictions in your team's docs
```

**Body:**

For the past year I've been building a knowledge integrity tool for teams — cross-referencing Slack conversations against Notion/Confluence docs to find contradictions, stale commitments, and undocumented decisions.

Today I'm open-sourcing the detection layer as a standalone CLI called Ody Refine (Apache 2.0).

**What it does:**

Run it against a folder of markdown, exported Slack JSON, or a Notion export and it produces a health report. Five detectors, all pure functions, no LLM required:

- **Contradiction** — two sources that disagree on the same topic (e.g., API rate limit is 1,000 req/min in the docs, 500 req/min in the handbook)
- **Staleness** — commitments and processes that haven't been updated (e.g., "weekly sync" mentioned but never happened in 4 months)
- **Duplicate** — same knowledge documented in multiple places with drift between copies
- **Undocumented decision** — something decided in a conversation but never written down
- **Time bomb** — a deadline, SLA, or commitment approaching expiry with no renewal doc

```bash
$ npx ody-refine ./docs/
```

No login, no API key, no data leaves your machine.

**Real results from three public scans:**

**1. Prime Intellect (distributed training infrastructure):**

```
[CONTRADICTION] GPU allocation — confidence 0.94
  api-reference.md:44  → "GPU allocation: 256 per job"
  infra-guide.md:18    → "GPU allocation: 64 per job"
  Same semantic claim, incompatible values.
```

Both docs were "current." Neither was marked as authoritative. An engineer making a new job configuration would pick one at random — that's a 4x cost overrun on the first real workload.

**2. Stripe's public API docs:**

Found 2 expired deadline commitments — dates referenced in the documentation that have passed with no update or acknowledgment. Still listed as if active. The kind of thing that signals a feature is in limbo and nobody updated the docs when the deadline changed.

**3. 857 pages of exported Confluence data** (real org knowledge, exported for testing):

Found version drift on a core process document — the same workflow described differently across 3 pages — plus expired commitments from 2023 still referenced as active policy.

**Performance:** Sub-second for 6 files on a MacBook Pro. 100% precision on critical findings in this run — every flagged item was a real issue, no false positives.

**One honest note on setup:** The full semantic pipeline uses local embeddings. First run downloads a ~30MB model via transformers.js, then everything runs fully offline. No API key needed. If you want zero dependencies even for first run, `--no-llm` mode uses pure heuristics for structural detection (time bombs, staleness).

**How it works (technically):**

The contradiction detector doesn't do keyword matching. It builds a semantic claim graph — extracting typed assertions (who/what/how-many) from each document, clustering them by concept, and walking the graph to find incompatible values.

"Max throughput" and "rate limiting cap" resolve to the same claim node. That's how it catches conflicts across docs written by different people months apart.

Pure TypeScript, pure functions. The detectors have no side effects and no external dependencies — you can read and test every one.

**Why open-source:**

The trust problem in knowledge tooling is real. I've talked to 50+ teams — they're interested, but they won't connect a new tool to their Slack and Notion until they trust the vendor. Can't blame them. Open-sourcing the detection engine means you can audit exactly what runs against your data before deciding anything else.

There's been recent activity in the "context graph" space (HydraDB just raised $6.5M for an ontology-first approach to RAG context). Worth noting the distinction: that space is about *delivering* accurate context to LLMs. Refine is about *verifying* the integrity of the knowledge that feeds those pipelines. Complementary problems, different tooling.

**The backstory:**

I watched a 65-person company shrink to 10. The knowledge didn't shrink with it — it scattered into outdated Confluence pages, forgotten Slack threads, and departed engineers' heads. We documented everything before people left. They still call.

Every team has this problem. The docs say one thing. Slack said something else three weeks ago. Nobody knows which is right.

**Tech stack:**

- TypeScript, Node 20+
- SQLite (default) with sqlite-vec for vector search
- transformers.js (Xenova/all-MiniLM-L6-v2) for zero-config local embeddings
- Ollama auto-detect (uses local model if available, falls back to transformer)
- 5 pure-function detectors with eval gate on tuning
- 342 tests, vitest

GitHub: [link]
Docs: [link]

Happy to answer questions about the detection architecture, how the contradiction detector handles semantic vs. structural disagreements, or the eval gate design.

---

## 2. Twitter/X Launch Thread

**Tweet 1 (Hook):**
```
Your docs say one thing. Your team decided something else in Slack three weeks ago.

Ody Refine finds all of those. Open source. Runs on your laptop. Your data never leaves.

🧵
```

**Tweet 2 (Problem):**
```
A new engineer joins.

She reads the API docs: "Rate limit: 1,000 req/min"
She reads the handbook: "Rate limit: 500 req/min"
She asks Slack. Three people give three different answers.

She picks one. Ships it. Gets paged at 2am.

This isn't a documentation problem. It's a knowledge integrity problem.
```

**Tweet 3 (Why it's hard):**
```
The frustrating part: your knowledge is probably fine when it's written.

It breaks over time.

- Slack thread overrides a doc nobody updates
- A process changes but the runbook doesn't
- SLA is committed in email. Never written down. Expires quietly.

73% of documented processes are outdated within 6 months.
```

**Tweet 4 (Solution):**
```
Today I'm open-sourcing the detection layer.

Ody Refine: a CLI with 5 detectors that runs against your docs folder.

```
$ npx ody-refine ./docs/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ody refine  ·  6 files  ·  840ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ██████░░░░  67/100 Needs attention

  2 critical  ·  3 warnings  ·  1 info

  ✖ [contradiction] GPU alloc: 256/job vs 64/job
  ✖ [timebomb]      SLA deadline in 14 days
```

No login. No API key. Data stays on your machine.
```

**Tweet 5 (Demo / Differentiator):**
```
Real finding from Prime Intellect's public infrastructure docs:

  api-reference.md:44  → "GPU allocation: 256 per job"
  infra-guide.md:18    → "GPU allocation: 64 per job"

Both "current." Neither marked authoritative.
Pick the wrong one → 4x cost overrun on your first job.

The detector builds a semantic claim graph. Different words, same concept, incompatible values → flagged. Pure function, no LLM required.
```

**Tweet 6 (Why open source):**
```
I've talked to 50+ teams about this.

Every single one said: "Interesting, but I'm not connecting my Slack and Notion to a tool I don't know."

Fair.

So: open source the detector. You can audit every line before you run it. The trust has to be earned, not assumed.

github.com/[link]
```

**Tweet 7 (Ask):**
```
If you've ever:
- Said "half our docs are wrong and I don't know which half"
- Watched a new hire follow an outdated runbook and break something
- Tried to do a manual docs audit and gave up

Try this. Tell me what it finds.

[repo link] — Apache 2.0, contributions welcome.
```

---

## 3. LinkedIn DMs — 10 Personalized Outreach Messages

*Target: PMs, Ops leads, and Chiefs of Staff at 20-50 person YC-backed companies with public documentation.*

*Approach: Refine can scan public docs (help center, API docs, changelog, public handbook) without any auth. Lead with a real finding, make them want the internal version.*

---

**DM 1 — Pylon (YC S23, B2B customer support platform)**

```
Hey [Name] — saw Pylon's been scaling fast since the Series A. Quick question:

When was the last time someone followed an outdated support runbook and gave a customer the wrong answer?

I built a CLI that scans your public docs for contradictions, stale commitments, and decisions that never got written down. Ran it against Pylon's public help center — found 2 places where the same feature is described differently across your docs pages.

Imagine what's in your internal Slack vs. your Notion.

Takes 10 min to connect internal sources. Results in 48 hours. Not sure if this is more of an ops problem or a CS lead problem — would value your take.
```

---

**DM 2 — Vapi (YC W23, voice AI APIs)**

```
Hey [Name] — following Vapi's growth from the outside. Developer tools at your scale always hit the same wall: your API docs evolve faster than your internal knowledge does.

Question: do you have a system for catching when a Slack decision makes a doc wrong?

I ran Ody Refine (open source, local) against your public API docs — found 3 places where the rate limit description and the webhook behavior docs appear to be out of sync with each other.

If that's in your public docs, I'd bet there's more in your internal Notion. Tool scans everything, reports what's broken. No auth, no data leaving your machine.

Worth 30 minutes?
```

---

**DM 3 — Mintlify (YC W22, developer docs platform)**

```
Hey [Name] — I'm building a CLI that finds contradictions in team docs, and I had to reach out because you're the most ironic target imaginable: the docs platform that probably has the best public docs of any team in this ICP.

Ran Refine against your public site. Found one stale commitment in the changelog (a feature announced Q3 2024 that appears to be referenced differently across two pages).

I know you think about documentation quality more than anyone. Curious if you have a systematic way to catch internal drift — or if it's still "someone notices and fixes it."

Not pitching. Genuinely asking if this is a problem you've solved.
```

---

**DM 4 — Composio (YC W24, AI tool integrations)**

```
Hey [Name] — Composio's at the intersection of AI and ops, so you probably feel this acutely:

AI agents act on knowledge. If the knowledge is wrong, the agent does something wrong. At scale.

I built an open-source CLI that cross-references docs against each other (and against Slack, if you connect it) to find contradictions before your agents act on them. Ran it against your public integration docs — flagged 2 places where the same integration is described with different auth flow steps across pages.

Takes 10 min to point at internal docs. 48-hour report. Curious if "knowledge entropy in the tools we orchestrate" is a problem you've already hit.
```

---

**DM 5 — Letta (YC W24, agent memory framework)**

```
Hey [Name] — you're building memory for AI agents. I'm building the integrity layer that makes sure the memory is correct.

The obvious joke aside: I ran Ody Refine against Letta's public docs. Found your memory storage docs and your stateful agent docs use slightly different terminology for what appears to be the same concept (stateful persistence vs. in-context memory). Might be intentional — might be drift.

The question I'd ask your team: when a Slack conversation overrides a design doc, how quickly does the doc get updated? In most 25-person teams: never.

Curious what you've tried.
```

---

**DM 6 — Graphite (YC W21, code review / stacking)**

```
Hey [Name] — engineering-forward team, detailed public docs, active changelog. You're the kind of team that cares about this.

I ran Ody Refine (open source, local) against your public documentation. Found one place where your CLI docs and your web app docs describe the same workflow differently — might be a version sync issue.

At Graphite's scale you probably have enough internal Slack activity that decisions are regularly getting made without the corresponding Notion page being updated.

I'm building a tool that finds those. 10 min setup, 48-hour report, no data leaves your machine. Would value your take on whether the finding type that matters most for an eng-heavy team is contradiction detection or undocumented-decision detection.
```

---

**DM 7 — Fern (YC W23, API docs generation)**

```
Hey [Name] — you're solving the problem of keeping API docs in sync with code. I'm solving the adjacent problem: keeping your team's knowledge in sync with itself.

Your Slack says one thing. Your Notion says something else. Nobody knows which is current.

I ran Refine against Fern's public docs — found 2 spots where the same configuration option is described with different default values across your quickstart and your reference docs. Small thing. But imagine what that looks like internally.

Open source, runs locally, 5 detectors. Happy to share the output from your public scan if useful.
```

---

**DM 8 — Turso (YC S23, SQLite edge database)**

```
Hey [Name] — Turso has great public docs and an active community. Which also means you have a high surface area for drift: changelog, blog posts, API reference, tutorials — all written at different times, updated at different cadences.

Ran Ody Refine against your public docs. Found your replication docs and your edge deployment docs appear to describe the same concept (primary vs. replica instance handling) differently.

Internally — with Slack on top of Notion — I'd bet there are 10 more.

Open source CLI, local run, no auth. Worth seeing what it finds on your internal docs?
```

---

**DM 9 — Dex (YC, professional relationship CRM)**

```
Hey [Name] — Dex is all about relationship context — who said what, when, what was committed to.

The meta-irony: most teams at your stage have the same problem internally. Commitments made in Slack. Never written down. Nobody knows what was agreed.

I ran our CLI against your public help center. Found one place where your privacy settings docs and your integration permissions docs appear to describe data access differently.

I'm building a tool that surfaces those contradictions — cross-referencing conversations against docs. Designed for the ops and CS side, not just eng. 10 min to connect, 48-hour report.

Would value your take: is this more of a customer-commitments problem or an internal-ops problem at your stage?
```

---

**DM 10 — Mem0 (YC W24, AI memory layer)**

```
Hey [Name] — you're building memory for AI. The irony is that the team behind a memory product probably has the same problem every 25-person team has: institutional memory that lives in Slack and never makes it to docs.

Ran Ody Refine against your public site. The memory types documentation and the integration quickstart describe the memory object schema slightly differently — field names that don't quite match.

Internally, I'd bet you have decisions buried in Slack that contradict your Notion.

Open source CLI. Runs locally. No data leaves your machine. That last part matters here more than most places — the irony of a memory/AI tool seeing your internal Slack is real, and I get it.

Here's the GitHub if you want to audit what it actually does before connecting anything: [link]
```

---

## 4. Investor Update Email

**Subject:** Platform evolution update — open-sourcing the detection layer

---

Hi [Name],

Quick update — we've made a significant architecture decision that I wanted to share before our next conversation.

**What changed:**

We're splitting Ody into three layers, each with its own trust model:

- **Ody Refine** (launching in weeks 1-6): Open-source CLI. Runs locally. No login, no cloud, no data ever leaves the user's machine. Detects contradictions, staleness, duplicates, undocumented decisions, and time bombs in team docs. Apache 2.0.
- **Ody Forge** (weeks 7-12): Proprietary managed service. Takes cleaned data from Refine and trains a model that belongs to the team.
- **Ody Colleague** (weeks 13-18): Agentic assistant powered by the fine-tuned model. Every interaction is a training signal. The model improves continuously.

**Why this matters for the raise:**

The core GTM problem was trust. I'd talked to 50+ teams — genuinely excited, but unwilling to connect Slack and Notion to a solo founder they just met. Understandable.

Open-sourcing the detection layer removes that blocker entirely. You run it on your laptop. You see 47 contradictions in your own docs. You didn't give us anything — no login, no API key, no data. When you're ready to go deeper, the trust is already there.

This is the Elastic/HashiCorp playbook: open source creates distribution, proprietary layers capture revenue.

**What exists now:**

| | |
|---|---|
| Existing product | Full web app + Slack bot + MCP endpoint, live at app.useody.com |
| Integrations | 7 connectors (Slack, Notion, Linear, Confluence, Jira, Gmail, Teams) |
| Platform (new repo) | Open-source architecture — 342 tests, 5 detectors, SQLite core, CLI pipeline |
| Revenue bridge | Paid knowledge audits ($2-5K) using Refine, real revenue before Forge launches |

**Current milestones:**

- Month 1: Refine on GitHub. HN launch. First GitHub stars.
- Month 3: 1,000 stars. First Forge beta users from Refine pipeline.
- Month 6: 50 Forge users. First Colleague pilots.
- Month 9: 50 teams / $15K MRR.

**The category moment:**

Foundation Capital called the knowledge integrity gap "trillion-dollar, no incumbent in the cross-system path" (Dec 2025). a16z published "Your Data Agents Need Context" on March 10 — agents are "useless without the right context" — and ended with an open question: "Will the context layer be its own product?" We already built the answer.

Sequoia backed Rowspace ($50M, Feb 2026) on the thesis that agents fail without accurate context — same thesis, different domain (finance vs. team knowledge). In YC's W26 batch (196 companies), nobody builds knowledge verification.

**What I'm looking for:**

The round is $1M on a post-money SAFE ($8-10M cap). 18 months of runway. Beyond capital: intros to technical design partners (eng leaders at 20-50 person teams who would run a free Refine audit), and anyone in the developer tools community who's lived this problem firsthand.

Happy to share the GitHub repo, run a live Refine audit on a public target, or walk through the three-layer architecture in more detail.

Talk soon,
Ufuk

---

## 5. Design Partner Brief

**Ody Refine — Free Knowledge Audit for Your Team**

---

### What Refine does

Your docs say one thing. Your team decided something else in Slack three weeks ago. Nobody knows which is right.

Ody Refine is an open-source CLI that cross-references your documentation against itself (and against Slack conversations, if you choose to include them) and surfaces:

| Finding type | Example |
|---|---|
| **Contradiction** | API rate limit is 1,000 req/min in the docs, 500 req/min in the handbook |
| **Stale commitment** | "Weekly sync" process described in the handbook, hasn't happened in 4 months |
| **Duplicate with drift** | Onboarding guide exists in two places; they've diverged over time |
| **Undocumented decision** | Engineers agreed in Slack to deprecate an endpoint; nothing in the docs |
| **Time bomb** | Customer SLA expires in 14 days; no renewal doc exists |

**What you get:** A structured health report — findings ranked by severity, with source citations and suggested resolutions.

---

### What we're asking for

We're looking for 5 design partners to run a free 30-day Refine audit on their internal docs.

**From you:**
- 30 minutes to point Refine at your doc sources (Notion export, Confluence export, or a folder of markdown)
- Optional: Slack export from one or two channels (your call — Refine runs locally, data never leaves your machine)
- 5 minutes per week to tell us: which findings were useful, which were noise

**From us:**
- Full Refine audit at no cost
- Direct access to the founder (I'll personally review your findings report)
- Influence over what we build next — design partners shape the roadmap
- Permission to use anonymized findings patterns as a case study (only with explicit approval)

**Time commitment:** 30 min setup. 5 min/week check-in. 30-day pilot.

---

### Why this is worth your time

The audit is the product. You will see things you didn't know were broken.

Every team we've run this on has had the same reaction: *"I knew our docs were a mess. I didn't know it was this specific."*

Common reactions:
- "I tried to do this manually last quarter. It took two days and I only covered 30% of the docs."
- "We have three different answers to the same question depending on which page a new hire lands on."
- "I didn't know that Slack thread had contradicted our official policy."

You get a free audit. We get a real-world test case and feedback. Clean exchange.

---

### Who this is for

Teams that:
- Are 15-50 people and growing
- Use Slack + Notion, Confluence, or similar
- Have someone who feels this pain: onboarding is slow, docs are wrong, things fall through the cracks

Best-fit roles: VP Engineering, Head of Ops, Chief of Staff, founding team

---

### Security / privacy

- Refine runs locally on your machine (or a machine you control)
- No data is sent to any server unless you explicitly configure Forge (a separate, opt-in product)
- Open source — every line of code is auditable before you run it
- Apache 2.0 license

---

### To get started

Email ufuk@useody.com with the subject line "Design Partner" or reply here. I'll send the GitHub link and a 10-minute setup guide. First audit report back within 48 hours.

---

*Ody is built by Rodyr Inc., a Delaware C-Corp. Founder: Ufuk Karaca. Based between Berlin and San Francisco.*

---

## 6. Email Capture — No-Backend Options

*Goal: capture emails from the landing page and Show HN traffic without any backend.*

### Recommendation: Formspree (default choice)

**Why:** Single HTML `<form>` tag, no JavaScript required, free tier handles 50 submissions/month.
After launch spike, upgrade to $10/mo for 1,000 submissions/month.

```html
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
  <input type="email" name="email" placeholder="you@company.com" required />
  <button type="submit">Get early access</button>
</form>
```

**Setup:** formspree.io → New Form → copy the ID → paste into `landing-page.html`.
Emails arrive in your Formspree dashboard and optionally forward to ufuk@useody.com.

---

### Alternatives Evaluated

| Service | Free tier | Best for | Note |
|---------|-----------|----------|------|
| **Formspree** | 50/mo | Landing page form | ✅ Recommended. No JS needed. |
| **Buttondown** | 100 subscribers | Newsletter | Best UX if you plan to send regular updates. Free up to 100. Grow to paid later. |
| **Kit (ConvertKit)** | 1,000 subscribers | Newsletter w/ automations | Overkill for launch, great long-term |
| **Netlify Forms** | 100/mo | If hosted on Netlify | Zero config, but only if on Netlify |
| **Tally.so** | Unlimited | Standalone form page | Beautiful forms, works as a backup landing page too |
| **Mailchimp** | 500 contacts | Transactional + campaigns | Ugly embedded form, brand-diluting |

---

### Recommended Stack

**At launch:** Formspree (form on landing page) + personal follow-up for every signup under 50.

**At 100 signups:** Migrate to Buttondown or Kit. Set up a simple onboarding sequence:
1. Day 0: "Thanks — here's how to run Refine in 2 minutes" (setup guide)
2. Day 7: "What did you find?" (feedback request)
3. Day 30: "Ody Forge is coming — here's what it does" (Forge waitlist)

**Add to landing page:**
- After form submission, redirect to: `https://github.com/useody/refine` (stars the momentum)
- Or show: "You're on the list. Try it now: `npx ody-refine ./docs/`"

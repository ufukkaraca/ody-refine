# First 100 Users — Ody Refine

*Who are the first 100 people who will actually use this?*

---

## Strategy

Refine can scan **public docs** (API reference, help centers, public handbooks) without any auth.
This means we can lead with a real finding — not a pitch — in every first message.

**Approach:** Find a real contradiction in their public docs → DM/email with the specific finding → offer the internal version.

---

## Segment 1: YC Companies with Public Documentation
*Why they care: Growing fast, docs entropy is real, engineering-forward culture means they'll appreciate a CLI tool.*
*Approach: "I ran Refine on your public docs and found X" cold DM.*

### Tier A — Direct Fit (tool companies with detailed public docs)

| Company | Stage | Why They Care | Finding Angle | Contact |
|---------|-------|---------------|---------------|---------|
| **Mintlify** | YC W22 | They build docs tooling — ironic AND relevant | Check for changelog drift vs feature docs | Head of Product / CTO |
| **Fern** | YC W23 | API docs generation — same space | Default values described differently in quickstart vs reference | CTO |
| **Graphite** | YC W21 | Eng-heavy, detailed CLI docs | CLI docs vs web app docs describing same workflow differently | VP Engineering |
| **Turso** | YC S23 | SQLite edge DB, heavy technical docs | Replication docs vs edge deployment docs using inconsistent terminology | DevRel |
| **Vapi** | YC W23 | Voice AI APIs, docs evolve fast | Rate limit docs and webhook docs appear out of sync | Eng Lead |
| **Composio** | YC W24 | AI integrations, high surface area for drift | Same integration described with different auth flow steps | Head of Eng |
| **Letta** | YC W24 | Agent memory framework | "Stateful persistence" vs "in-context memory" — same concept? | Founder |
| **Mem0** | YC W24 | AI memory layer | Memory object schema inconsistency across docs | Eng Lead |
| **Dex** | YC | Professional CRM | Privacy settings docs vs integration permissions docs | Founder |
| **Pylon** | YC S23 | B2B support platform | Feature described differently across help center pages | Head of CS |

### Tier B — Strong ICP (companies at 15–50 people with Notion/Confluence + Slack)

- **Linear** — eng tool company, heavy internal docs culture, would understand and appreciate the product
- **Raycast** — developer productivity, active community, they'd share it
- **Retool** — 200-person but heavy on internal tooling culture, look for a champion
- **Codeium** — AI dev tools, YC S21, fast growth = doc entropy
- **Jasper** (AI writing) — content company with irony factor
- **Causal** — planning tool, process-heavy by definition
- **Ramp** — fintech, compliance-driven, SLAs and processes documented rigorously — time bombs are real
- **Brex** — same as Ramp, but look for eng champion not finance
- **Vercel** — too big for cold outreach, but if Ufuk knows anyone there
- **Loom** (Atlassian) — too big, skip

---

## Segment 2: Developer Tool Companies with OSS Documentation
*Why they care: Their docs are their marketing. Drift embarrasses them publicly.*
*Approach: File a GitHub issue with the contradiction found — not a DM. Let quality speak.*

| Company / Project | Approach |
|---|---|
| **Docusaurus** (Meta OSS) | Run Refine on the docs, file issue with findings |
| **Redocly** | API docs tooling — they'd appreciate the meta-use |
| **Markdoc** (Stripe) | Heavy docs culture, developer-first |
| **Nextra** | Next.js docs framework, popular in the space |
| **VitePress** | Technical community, would share if it works |
| **tldraw** | OSS whiteboarding, active community |
| **Plane** | OSS project management, public docs, would appreciate CLI tooling |
| **Cal.com** | OSS scheduling, community-driven, founder (@peer_rich) is active on X |
| **Trigger.dev** | Developer-first background jobs, great docs culture |
| **Inngest** | Similar to Trigger.dev, developer community |

**Tactic:** For OSS projects, the "issue" approach converts better than a DM. File a polished issue: "Found 3 contradictions in your docs using Refine [link] — thought you'd want to know." Many will star and share.

---

## Segment 3: Ufuk's Direct Network (Warm)
*Why they care: They know Ufuk, they'll give honest feedback and might share.*
*Approach: Personal message, ask for feedback not stars.*

### Categories to contact personally:
1. **Ex-colleagues from the 65-person → 10-person company** (the company in the Show HN backstory) — most authentic connection to the problem
2. **People Ufuk has met at YC/SF events** — request a "will you run it on your docs and tell me if it's useful?"
3. **Berlin tech network** — Intercom alumni, Contentful crew, N26 alumni (all have documentation-heavy cultures)
4. **Founders in Ufuk's peer group** who are currently at 20–50 person companies

**Target: 20 warm contacts, 10 actual runs, 3–5 public testimonials**

---

## Segment 4: OSS Maintainers & Developer Content Creators
*Why they care: They publish content about developer tools. A tool that finds contradictions in docs is inherently newsworthy.*
*Approach: "I built this, would you be willing to run it on your own docs and share what you find?"*

| Person / Channel | Why Relevant | Approach |
|---|---|---|
| **Theo (t3.gg)** | 300K YouTube, builds OSS tools | Personal DM on Twitter — he loves CLI tools |
| **ThePrimeagen** | 500K+ developer audience | If Refine works on code comments/docs — angle it as eng tool |
| **Fireship** | Viral dev content | The "73% of your docs are wrong" stat is made for his format |
| **Josh tried coding** | Next.js community | If landing page uses Next.js — authentic reach |
| **Readme.com** | Developer documentation platform | Partnership angle — run Refine on their customers |
| **GitBook** | Docs platform | Same as Readme |
| **Swimm** | Dev documentation sync tool | Adjacent space, could be a partnership or a competitor check |

---

## Segment 5: SF In-Person (Ufuk's Window: March 15–31)
*Why this segment is special: in-person demo converts at 10x the rate of a cold DM.*
*Approach: "Can I show you something on your laptop right now?"*

### Target neighborhoods & communities:
- **Soma → Figma campus** — design/product PMs, Chiefs of Staff
- **Vercel SF office** — eng leadership
- **Mission → Retool / Brex HQs** — operations-heavy companies
- **SF YC alumni events** — any event during March, attend and demo in person

### In-person script:
> "Give me the URL to your public docs — I'll run this right now on your computer and we'll see what it finds."

**Target: 5 in-person demos. 2 design partner commitments from this cohort.**

---

## Segment 6: Niche Communities
*Lower volume but higher quality engagement.*

| Community | Channel | Approach |
|---|---|---|
| **Hacker News** | "Ask HN: How do you keep your internal docs accurate?" | Answer the question, mention Refine as a tool you built |
| **Dev.to** | Write "I built a CLI that finds contradictions in your docs" | Technical post, not a product announcement |
| **r/devtools** | Share a "real finding" post — not a launch post | The GPU finding is perfect for Reddit |
| **r/programming** | Same finding post | Lead with the problem, not the product |
| **Lobste.rs** | Submit the technical blog post | Smaller but higher quality than HN sometimes |
| **Software Architecture Slack** | Post in #tools channel | CTOs, Eng Directors who care about doc quality |
| **Rands Leadership Slack** | Eng managers, VPs Engineering — exactly the ICP | Share as a tool worth evaluating |
| **Chief of Staff Network** | Ops-heavy, cross-functional leaders | Frame as "knowledge audit" not "CLI tool" |

---

## Outreach Prioritization

| Priority | Segment | Expected Users | Effort |
|----------|---------|----------------|--------|
| 1 | Warm network (personal) | 10–15 users | Low |
| 2 | YC companies via DM | 20–30 users | Medium |
| 3 | SF in-person demos | 5–10 users | High (worth it) |
| 4 | OSS project issues | 10–15 users | Low (high ROI) |
| 5 | Dev content creators | 20–30 users | Medium |
| 6 | Communities | 10–20 users | Low |

**Path to first 100:** Warm network (15) + YC DMs (25) + SF demos (10) + OSS issues (15) + community posts (20) + content creator shares (15) = **100**

---

## Message Templates

### For YC Companies (email/DM)
```
Subject: Found something in your docs

Hey [Name],

I ran Ody Refine (open source, local) against [Company]'s public docs.

Found: [specific finding] — [doc A] says X, [doc B] says Y.

Imagine what's in your internal Slack vs Notion.

Here's the GitHub: [link] — it runs in 2 minutes on a folder of markdown.

Curious if this is something your team has tried to solve manually.

— Ufuk
```

### For OSS Maintainers (GitHub issue)
```
Title: Found 3 documentation contradictions using Ody Refine

Hey! I ran Ody Refine (open source CLI, [link]) against this project's docs and found
some things that might be worth fixing:

1. [doc A] says X, [doc B] says Y — same concept, different values
2. ...
3. ...

No action required — just wanted to flag in case it's useful.
Happy to run a full scan if you want more details.
```

### For warm network
```
Hey [Name], I've been building something the past few weeks and want honest feedback
before I show it to the world.

It's a CLI that finds contradictions in your team's docs — runs locally,
no login, data never leaves your machine. Takes 2 minutes to try.

Do you have a folder of markdown or a Notion export I could run it against with you?
Would rather show than explain.
```

---

*Last updated: March 15, 2026*

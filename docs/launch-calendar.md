# Ody Refine — Launch Calendar

*From: March 15, 2026 — Target: Show HN mid-April 2026*
*Ufuk in SF until March 31 (15 days in-person window)*

---

## Strategic Framing

**Goal:** Arrive at Show HN with social proof baked in.
- GitHub stars from DMs + private shares
- 1–2 design partners who've actually run it
- A real public finding to anchor the post
- HydraDB positioned as complementary (they do context delivery, we do context integrity)

**Rule:** Don't Show HN until it's embarrassing NOT to. Mid-April is the right window — gives 4 weeks for the repo to breathe, gather issues, and accumulate organic stars.

---

## WEEK 1 — March 15–21: Polish & Seed

**Theme:** Make the repo something you'd actually star.

### Actions
- [ ] Push repo to `github.com/useody/refine` with full README, real terminal GIF, 5 detector docs
- [ ] Register `@useody` npm scope, publish `@useody/refine@0.1.0`
- [ ] Landing page live at `refine.useody.com` (or GitHub Pages from `docs/landing-page.html`)
- [ ] Record 90-second demo video: real Notion export → `npx ody-refine` → HTML report
- [ ] Privately share to 5 trusted people in network (SF connections, ex-colleagues) — ask for issues, not stars

### In-Person (SF)
- Schedule 3–5 coffee meetings with eng leads, PMs, CTOs at 20–50 person companies
- Bring laptop: live-run Refine on their public docs during the meeting
- Target: Soma + Mission neighborhood offices (Figma/Vercel/Retool ecosystem)

### Targets
- 10 GitHub stars (organic from private shares)
- 1 design partner conversation booked
- 0 public announcement

---

## WEEK 2 — March 22–28: Private Beta Push

**Theme:** Build the private wave before the public one.

### Actions
- [ ] Send personalized DMs to 10 YC founders (from `first-100-users.md` list)
  - Use the "I scanned your public docs and found X" hook
  - Do NOT ask for stars — ask for feedback
- [ ] Post in 1–2 private Slack communities (eg. Founder-slack, SaaStr Slack, Indie Hackers Discord) as "I'm building this thing and want brutal feedback"
- [ ] Reach out to 3 OSS maintainers in doc-heavy projects (Docusaurus, Redocly, etc.)
- [ ] Add to `awesome-developer-tools` type lists as PR (low friction, real exposure)
- [ ] Set up Formspree or Buttondown for email capture on landing page

### In-Person (last week in SF)
- Priority: design partner commitments (want 2 before leaving SF)
- If any meeting goes well → ask to run Refine live on their Notion export during meeting
- 1 coffee with someone in the dev tools investor community (even just to share the project)

### Targets
- 50 GitHub stars
- 2 design partners actively running Refine
- 5–10 email signups from landing page
- 1 real issue filed by someone not you

---

## WEEK 3 — March 29 – April 4: First Public Signal

**Theme:** One piece of public content that travels on its own.

### Actions
- [ ] Twitter/X thread: the "Your docs have a 64 vs 256 GPU contradiction" real finding story
  - Lead with the actual finding, not the product
  - End with the GitHub link
  - Tag HydraDB if they're active on Twitter — frame as complementary ("they do delivery, we do integrity")
- [ ] Dev.to or Hashnode post: "How I built a semantic contradiction detector (and what I found in real team docs)"
  - Technical, honest, shows the architecture
  - Embeds the terminal demo GIF
- [ ] Submit to: Hacker News "Who's hiring" thread (mention Ody/Refine in the context)
- [ ] LinkedIn post from Ufuk's personal account (not a product post — a story post)
- [ ] Set up `ody-refine` Discord channel (or GitHub Discussions)

### Targets
- 150 GitHub stars
- First 3 real GitHub issues filed by non-team users
- 1 unsolicited retweet or share from someone with >500 followers
- 20+ email signups

---

## WEEK 4 — April 5–11: Pre-HN Runway

**Theme:** Build the "already has traction" perception for when we post.

### Actions
- [ ] Drop in 3 relevant HN "Ask HN" threads (don't shill — add genuine technical value, mention Refine only if directly relevant)
- [ ] Reach out to 5 newsletter authors in devtools/OSS space:
  - Console.dev (devtools newsletter)
  - Changelog.com (open source podcast — pitch a "what I built" segment)
  - TLDR newsletter (they cover launches)
  - Pointer.io
  - Bytes.dev
- [ ] Product Hunt soft launch (5 votes, no featured slot — just to exist)
- [ ] Publish first "Refine Findings" case study: anonymized real org, real contradictions found
- [ ] Create "vs" landing page or README section: "Ody Refine vs Vale vs LanguageTool" — positions clearly in the OSS space

### Targets
- 300+ GitHub stars
- 2 newsletter mentions booked (even if not yet published)
- 50+ email subscribers
- First design partner who agrees to be quoted

---

## WEEK 5 — April 12–18: Show HN

**Theme:** Go live when the groundwork is done, not before.

### Show HN Pre-Checklist
Before posting, confirm ALL:
- [ ] Repo has >300 stars (social proof)
- [ ] README has a real terminal GIF (not a screenshot)
- [ ] At least one real public finding documented in README or post
- [ ] `npx ody-refine ./docs/` works in under 30 seconds on a clean machine
- [ ] You have a short answer for "how is this different from Grammarly / Vale / LLM prompting?"
- [ ] You can respond to comments for 4+ hours after posting
- [ ] Design partner is ready to comment on the HN thread within the first hour

### Show HN Post Timing
- Post between **9–10am PT on a Tuesday or Wednesday**
- Have the design partner ready to comment with their real experience within 30 min
- Pin the real GPU finding example in the first comment

### Targets
- Top 10 on HN front page (aim for Ask HN: but Show HN is correct)
- 100+ upvotes
- 1,000+ GitHub stars from HN spike
- First Forge waitlist signups

---

## WEEK 6 — April 19–25: Post-HN Harvest

**Theme:** Convert the spike into something durable.

### Actions
- [ ] Reply to every HN comment personally (24h window)
- [ ] DM anyone who commented "how does X work" — offer a 20min call
- [ ] Publish follow-up: "24 hours after Show HN — what we learned"
- [ ] Submit to Product Hunt (now with HN link as social proof)
- [ ] Reach out to 5 companies that starred the repo: offer free design partner audit
- [ ] Email subscribers: share the real findings from design partners (anonymized)
- [ ] Reach out to 1–2 VCs with the "we launched, here's the traction" email

---

## Channel Priority Matrix

| Channel | Effort | ROI | When |
|---------|--------|-----|------|
| Personal DMs (warm network) | Low | Highest | Week 1–2 |
| SF in-person meetings | High | High | Week 1–2 |
| Twitter/X thread | Medium | High | Week 3 |
| Dev.to / Hashnode post | Medium | Medium | Week 3 |
| Newsletter outreach | Low | High (delayed) | Week 4 |
| Show HN | Low | Highest (one shot) | Week 5 |
| Product Hunt | Low | Medium | Week 6 |
| LinkedIn | Low | Medium | Week 3+ |
| OSS list PRs | Low | Low (long tail) | Week 2–3 |

---

## Key Metrics to Track Weekly

| Metric | W1 target | W2 | W3 | W4 | W5 (Show HN) |
|--------|-----------|----|----|----|----|
| GitHub stars | 10 | 50 | 150 | 300 | 1,000+ |
| Email subscribers | 0 | 10 | 30 | 50 | 200+ |
| Design partners | 0 | 1 | 2 | 3 | 5+ |
| Real issues filed | 0 | 1 | 5 | 10 | 30+ |
| npm downloads (weekly) | 10 | 50 | 100 | 200 | 1,000+ |

---

## Contingency: If HN Post Doesn't Land

- Don't re-post — wait 6 months (HN rules)
- Execute Product Hunt as main launch instead
- Use newsletter + Dev.to distribution as fallback
- The email list and design partners are what matter long-term anyway

---

*Last updated: March 15, 2026*

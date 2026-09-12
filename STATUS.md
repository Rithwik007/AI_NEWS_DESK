# Pipeline Status & Issue Tracking

Current build status:
- Step 1: RSS Fetch + Semantic Deduplication (`[x]`)
- Step 2: Relevance Filtering + Keyword Spam Filter (`[x]`)
- Step 3: Dynamic Selection + Groq Summarization with Calibrated Honesty (`[x]`)
- Step 4: Telegram Digest Delivery (`[x]` — Default Top 5 Stories mode, 24h stale-article aging, twice-daily morning/evening runs with `PipelineRun` tracking, listicle spam filter; legacy `all_tiers` preserved)
- Step 5: Multi-user Backend & Frontend Dashboard (`[x]` — User schema, Clerk auth, Telegram linking flow with bot deep link, per-user InterestProfile migration, ArticleRelevance model + backfill, multi-user pipeline refactor for Steps 2-4, and React+Vite PWA frontend with Login, Telegram Connect, and Interest Editor verified across mobile/tablet/desktop viewports)
- Step 6: Production Deployment & Automation (`[ ]` — Webhook/polling deployment, cron scheduling, monitoring)

---

## Known Issues — Step 2 Topic Assignment

### Symptom & Discovery
Confidence-tier calibration in Step 3 surfaced that several low-confidence (`rankingScore < 0.25`) articles were assigned to a `matchedTopic` that does not accurately reflect their actual content:
- **"AI for Good: How the UN Uses Artificial Intelligence to Advance Human Rights"**: Assigned to *"AI legislation, copyright lawsuits"* instead of international governance/social application.
- **"AI sovereignty crucial for cybersecurity, says Gaganyaan astronaut"**: Assigned to *"Consumer hardware devices, smartphones, on-device AI"* despite having no hardware or device relevance.
- **"Shipping’s AI challenge is no longer artificial intelligence. It’s data"**: Assigned to *"Consumer hardware devices, smartphones, on-device AI"* despite covering maritime logistics and enterprise data infrastructure.
- **"The Download: smarter AI in schools, and a robot 'carnival' in Shanghai"**: Assigned to *"Consumer hardware devices, smartphones, on-device AI"* despite covering classroom chatbots and a robotics expo.

### Diagnosis & Implications
`bestRawSimilarity` (unweighted cosine similarity between article embedding and topic embeddings) sometimes selects the **wrong** topic as the top match, rather than merely reflecting low relevance to the correct topic.
- This is a topic-assignment error in Step 2, distinct from threshold calibration.
- **Root causes to investigate later**:
  1. Topic phrasing semantic overlap or overly broad catch-all phrasing in low-weight topics.
  2. Embedding model (`all-MiniLM-L6-v2`) resolution limits in the $0.45 - 0.48$ similarity band.
  3. Lack of a multi-label or margin-of-victory check between competing topic candidates.

### Mitigation & Priority
- **Current containment**: Step 3's calibrated tone generation explicitly instructs the LLM not to oversell or force topic links for low-confidence articles. The generated `whyReadThis` text honestly reports the actual scope and notes the absence of direct topic relevance (e.g. *"This is mainly a commentary from a space astronaut on AI governance, not directly about consumer hardware"*). Users will not be misled.
- **Action plan**: Backlog quality improvement item. Revisit only IF this misassignment pattern recurs systematically across future daily batches or distorts high-confidence tiers. Do NOT make reactive scoring changes now.

---

## Known Architectural Limitations — Step 6 Deployment

### Telegram Long-Polling vs. Vercel Serverless
- **Issue**: Telegram long-polling requires a persistent always-running process with open HTTP hold loops (`timeout=25s`). Vercel serverless functions are stateless, ephemeral, and terminate after each request.
- **Resolution Plan for Step 6**:
  1. Switch from long-polling to Telegram webhook: configure Telegram Bot API to push incoming updates directly to a Vercel HTTPS API route (`/api/telegram-webhook`).
  2. OR host long-poller as background worker on separate always-on platform (e.g. Render or Railway).
- **Status**: Flagged early. Live reproduction observed during multi-user verification: poller process was stopped after server restart, causing silent frontend wait while Telegram queued `/start 2CFVPH`. Consumed immediately upon restarting poller. Concrete proof that serverless webhook architecture (`/api/telegram-webhook`) is mandatory for Step 6 production.

### PWA Service Worker Stale-Cache Risk
- **Issue**: PWA service worker can serve stale cached app shell after a frontend rebuild, causing blank/broken pages until a hard refresh or cache-name bump.
- **Resolution Plan for Step 6**: Needs a proper cache-versioning/invalidation strategy before Step 6 deployment (e.g., build-hash-based cache naming or automated service worker cache invalidation during Vite build), not just manual cache-name bumps during dev.
- **Status**: Documented as known deployment risk for Step 6.

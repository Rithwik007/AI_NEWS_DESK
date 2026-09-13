# Pipeline Status & Issue Tracking

> **DEPRECATED**: This document is preserved for historical sprint context only. [PROJECT_DOCUMENTATION.md](file:///c:/Rithwik/Projects/AI-news-delivery/PROJECT_DOCUMENTATION.md) is now the **single canonical source of truth** for project status, architecture, and backlog.

Current build status:
- Step 1: RSS Fetch + Semantic Deduplication (`[x]`)
- Step 2: Relevance Filtering + Keyword Spam Filter (`[x]`)
- Step 3: Dynamic Selection + Groq Summarization with Calibrated Honesty (`[x]`)
- Step 4: Telegram Digest Delivery (`[x]` — Default Top 5 Stories mode, 24h stale-article aging, twice-daily morning/evening runs with `PipelineRun` tracking, listicle spam filter; legacy `all_tiers` preserved)
- Step 5: Multi-user Backend & Frontend Dashboard (`[x]` — User schema, Clerk auth, Telegram linking flow with bot deep link, per-user InterestProfile migration, ArticleRelevance model + backfill, multi-user pipeline refactor for Steps 2-4, and React+Vite PWA frontend with Login, Telegram Connect, and Interest Editor verified across mobile/tablet/desktop viewports)
- Step 6: Production Deployment, Automation & Observability (`[x]` — Split hosting on Render backend + Vercel frontend, persistent long-poller via `startAll.js`, Sentry error monitoring, PostHog analytics, missed-run watchdog at 08:35/18:35 IST, cron-job.org keep-alive)

---

## Known Issues — Step 2 Topic Assignment

*See [PROJECT_DOCUMENTATION.md Section 5](file:///c:/Rithwik/Projects/AI-news-delivery/PROJECT_DOCUMENTATION.md#5-known-limitations--backlog-not-yet-resolved) for the active backlog.*

`bestRawSimilarity` (unweighted cosine similarity between article embedding and topic embeddings) sometimes selects the **wrong** topic as the top match in the $0.45 - 0.48$ similarity band.
- **Current containment**: Step 3's calibrated tone generation explicitly instructs Groq LLM not to oversell or force topic links for low-confidence articles. Users are not misled.
- **Priority**: Low. Tracked in canonical backlog.

---

## Architectural Resolutions & Status

### Telegram Long-Polling vs. Webhook Decision (RESOLVED)
- **Previous assumption**: Thought serverless webhook migration (`/api/telegram-webhook`) was mandatory.
- **Final resolution**: Reversed. Render persistent Linux dyno runs `src/scripts/startAll.js` (spawning Express and Telegram poller in one process). Long-polling kept as-is, eliminating webhook exposure and SSL certificate complexity. Documented in [PROJECT_DOCUMENTATION.md Section 4 Step 6A](file:///c:/Rithwik/Projects/AI-news-delivery/PROJECT_DOCUMENTATION.md#4-chronological-build-log).

### PWA Service Worker Stale-Cache (ACTIVE BACKLOG)
- Documented in canonical backlog: [PROJECT_DOCUMENTATION.md Section 5](file:///c:/Rithwik/Projects/AI-news-delivery/PROJECT_DOCUMENTATION.md#5-known-limitations--backlog-not-yet-resolved).


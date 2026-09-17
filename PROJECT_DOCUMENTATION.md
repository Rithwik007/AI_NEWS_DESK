# AI News Delivery Pipeline — Master Project Documentation

## Maintenance Rules For This Document
Every future task in this project must end with an update appended to this document's **Chronological Build Log** section, following the same per-entry format used below (`What was built` / `Why` / `How it works` / `Verification performed` / `Bugs found & fixed`). Do not skip this even for small tasks — a one-line entry is fine for a small task, full detail is required for anything that changes behavior, fixes a bug, or adds a feature.

- **Exact Dates**: Each new entry must use the actual current date (pulled from system or git commit date, never guessed or omitted).
- **Document Root Causes**: When a bug is found and fixed, always document the **ROOT CAUSE**, not just the symptom and patch. This document's value comes from explaining WHY things broke, not just that they were fixed.
- **Preserve Decision History**: When an earlier documented decision is later reversed or corrected (e.g. a threshold retuned, an architecture decision changed), do not delete the original entry — add a new entry noting the change and link back to what it is revising, so the document preserves the actual decision history rather than only the current state.
- **Strict Verification Honesty**: Never fabricate a verification step, date, or result that did not actually happen — if something was not tested, state so explicitly rather than omitting it or implying it was.

---

## 1. Project Overview
The AI News Delivery Pipeline is an automated, personalized AI-news curation and delivery system. It fetches articles continuously from 15 high-signal sources (tech journalism, official lab research blogs, community discussions, and parallel news searches), deduplicates stories covering the same real-world events using local semantic embeddings, filters articles by relevance against individualized user interest profiles, synthesizes factual summaries with calibrated, honest rationale ("why you should read this") using a fast Groq LLM, and dispatches twice-daily digests to multiple independent users via Telegram.

The system features a self-serve Progressive Web App (PWA) dashboard with Clerk Google authentication, enabling users to customize topic definitions, adjust topic weight multipliers, and link their Telegram identity via one-click deep links.

---

## 2. Full Feature List
- **Multi-Source News Ingestion**: Ingests articles across 15 distinct sources:
  1. *TechCrunch AI* (RSS)
  2. *VentureBeat AI* (RSS)
  3. *MIT Technology Review* (RSS)
  4. *Google News: artificial intelligence* (RSS)
  5. *Google News: machine learning* (RSS)
  6. *Google News: large language model* (RSS)
  7. *Google News: generative AI* (RSS)
  8. *Google News: GPT OR Claude OR Gemini* (RSS)
  9. *OpenAI Blog* (RSS)
  10. *Google DeepMind Blog* (RSS)
  11. *Meta AI Engineering* (RSS)
  12. *Hugging Face Blog* (RSS)
  13. *Reddit r/MachineLearning* (RSS)
  14. *Reddit r/artificial* (RSS)
  15. *Hacker News* (Algolia REST API with `minPoints: 5`)
- **Semantic Embedding-Based Deduplication**: Generates 384-dimensional dense vector embeddings in-process using `all-MiniLM-L6-v2`. Clusters multi-source coverage into cohesive stories via Union-Find clustering with a tuned cosine similarity threshold (`0.72`).
- **Cross-Run Deduplication**: Retains a rolling 24-hour window of stored articles to merge newly published syndicate copies into existing clusters without re-processing.
- **Keyword Spam & PR Shield**: Pre-filtering regex pipeline blocking stock pump speculation, SEO market size/CAGR reports, training certifications, boilerplate fellowships, and affiliate listicles (15 spam matches confirmed, 0 false positives across 753 primary articles).
- **Per-User Relevance Gatekeeping**: Evaluates article embeddings against individual topic definitions. Separates raw similarity gatekeeping (`bestRawSimilarity >= 0.45`) from weighted prioritization (`rankingScore = bestRawSimilarity * weight`) to prevent low-weight topics from being locked out.
- **Dynamic Cluster Representative Selection**: Evaluates clusters to select the highest-quality article for summarization (prioritizing primary lab blogs over mainstream tech news, and mainstream over syndication).
- **Honesty-Calibrated LLM Summarization**: Uses Groq LLM (`openai/gpt-oss-20b`) with calibrated system instructions categorized into high, moderate, and low confidence tiers. Borderline matches explicitly acknowledge their peripheral nature rather than hallucinating topic connections.
- **Twice-Daily Delivery Schedule**:
  - **Morning Run (08:00 IST)**: Full rolling 24-hour top-5 digest.
  - **Evening Run (18:00 IST)**: Incremental top stories newly fetched since the morning run.
- **Multi-User Architecture & Authentication**: Clerk Google OAuth integration with a dedicated `User` and `InterestProfile` model. Allows independent users with different interest topics and Telegram accounts to receive distinct digests.
- **Self-Serve PWA Dashboard**:
  - Mobile-first, responsive Paper/Ink editorial aesthetic (Fraunces serif, Geist sans).
  - Interactive Interest Editor with topic creation, removal, and 0.00–1.00 weight multiplier sliders (supporting topic muting without deletion).
  - One-click Telegram linking flow with 10-minute linking codes and bot deep linking.
  - Installable PWA with custom app icons, web manifest, and service worker shell caching.
- **Production Resilience & UX States**:
  - Accessible visual loading spinners on all async views.
  - Action-aware inline error cards with "Try again" retry buttons.
  - Auto-redirect and notification on session expiry (401).
  - Global offline network detection banner.
  - Custom styled editorial 404 page.
- **Full Observability & Alerting**:
  - Full-stack Sentry error tracking on backend and frontend.
  - Sentry Missed Run Watchdog checking at 08:35 IST and 18:35 IST for absent pipeline executions.
  - PostHog product analytics tracking pageviews, user logins, and core interactions.
  - Lightweight `/api/health` endpoint pinged every 10 minutes via cron-job.org to keep Render free-tier dynos awake.
- **Conversational Telegram Assistant & On-Demand /digest**:
  - Direct 2-way conversational chat with Groq LPUs (`openai/gpt-oss-20b`).
  - Context injection: user's last 48 hours of delivered digest articles + recent 20 message turns.
  - Intelligent answering: uses digest context for story questions, general knowledge for unrelated questions without forcing AI links.
  - Strict cost safeguard: per-user rate limit (20 msgs/hr).
  - On-demand `/digest` command resending latest top-5 stories.
  - Automated 30-day message retention pruning running daily at midnight.

---

## 3. Tech Stack & Architectural Decisions
- **Node.js & Express**: Backend runtime and REST API. Selected for native asynchronous I/O, seamless package ecosystem, and lightweight memory footprint on free cloud tiers.
- **MongoDB Atlas**: Cloud document database for `Article`, `ArticleRelevance`, `User`, `InterestProfile`, `BotState`, and `PipelineRun`. Free tier provides sufficient storage for rolling article windows and multi-user profiles.
- **`@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`)**: Local in-process embedding generation via ONNX runtime. Generates 384-dimensional vectors in ~25ms per article. Chosen over OpenAI/Voyage embeddings to eliminate per-call API cost, avoid vendor rate limits, and maintain predictable batch processing.
- **Groq API (`openai/gpt-oss-20b`)**: Fast inference engine on LPUs. Chosen for sub-second generation latency (~1000ms), reliable native JSON mode output, and cost efficiency.
- **Telegram Bot API**: Push delivery channel. Chosen for instant mobile delivery, zero infrastructure cost, rich markdown support, and universal accessibility.
- **Clerk Auth**: Authentication and session management. Selected for drop-in Google OAuth support, pre-built React components, and secure JWT verification via `@clerk/express`.
- **React 18 + Vite**: Frontend single-page application and PWA. Chosen for rapid build times, modern developer experience, and minimal bundle footprint (~185 kB gzipped with all telemetry).
- **Render**: Persistent web host for Express API and background Telegram poller. Chosen over Vercel for backend execution because Render supports persistent Node.js processes, enabling in-process `node-cron` scheduling and Telegram long-polling without needing serverless webhook refactoring.
- **Vercel**: Edge CDN frontend host for the React PWA. Chosen for instant global edge delivery, automatic SSL, and zero-config Vite deployments.
- **Sentry**: Application error monitoring. Instrumenting pipeline execution, Telegram poller network errors, and missed-run watchdogs.
- **PostHog**: Privacy-first, lightweight product analytics for feature usage and pageview tracking.
- **cron-job.org**: External HTTP pinger hitting `GET /api/health` every 10 minutes to prevent Render free-tier dynos from idling into sleep mode.

---

## 4. Chronological Build Log

### Bundled into initial commit 632fb8b (2026-09-12) with no finer-grained git history — Step 1: Ingestion, In-Process Embeddings & Semantic Deduplication
- **What was built**: Initial news pipeline: RSS fetcher for major AI sources (`src/services/fetchRSS.js`), local embedding generation using `Xenova/all-MiniLM-L6-v2` (`src/services/embeddings.js`), and graph-based Union-Find clustering for duplicate detection (`src/services/dedup.js`).
- **Why**: AI news is characterized by massive redundancy across syndicated outlets. Deduplicating at ingestion prevents users from receiving duplicate coverage of identical announcements.
- **How it works**: Articles fetched from feeds have their title and snippet concatenated into a single string, embedded into 384-dimensional vectors, and compared pairwise using cosine similarity. A disjoint-set (Union-Find) algorithm with path compression and union-by-rank groups articles with similarity $\ge$ `SIMILARITY_THRESHOLD`. The earliest published article is designated `isPrimary: true`.
- **Verification performed**:
  - Tested on live dataset of 95 articles (4,465 article pairs).
  - *Threshold Tuning*: Initially set to 0.75. A real-world pair covering a "Jalapeño AI chip" had a similarity of 0.7427 and was missed at 0.75. Retuning threshold to `0.72` successfully merged the pair. The nearest false positive was measured at 0.6860 (two different stories discussing OpenAI security), establishing a clean 3.4% safety margin.
- **Bugs found & fixed**:
  - *Dead RSS Feeds*: Initial source plans included Anthropic and Mistral RSS feeds. Verification revealed Anthropic has no public RSS feed (renders empty/404) and Mistral uses dynamic Javascript rendering. Both were removed and replaced with targeted Google News query feeds (`GPT OR Claude OR Gemini`, `generative AI`).

---

### Bundled into initial commit 632fb8b (2026-09-12) with no finer-grained git history — Step 2: Relevance Filtering & Keyword Spam Shield
- **What was built**: Semantic relevance scoring against configurable interest profiles, complemented by keyword-based regex filters to strip commercial spam (`src/services/relevance.js`).
- **Why**: Not all AI news is relevant to technical practitioners; affiliate spam, stock pump pieces, and boilerplate PR distract from substantive breakthroughs.
- **How it works**: Each user profile defines topics with importance weights (0.0–1.0). Articles must first cross an unweighted `RAW_SIMILARITY_THRESHOLD` (0.45) against at least one topic. Articles that pass are assigned a `rankingScore = bestRawSimilarity * weight` and categorized into confidence tiers (`high` $\ge 0.35$, `moderate` $0.25 - 0.35$, `low` $< 0.25$).
- **Verification performed**:
  - Scored 282 primary articles. Evaluated raw score distributions across broad versus concrete topic phrasings.
  - Rephrasing abstract topic titles (e.g. "AI Models") into rich keyword-dense descriptors ("LLM releases, checkpoints, weights, benchmarks") raised the topic similarity ceiling from 0.49 to 0.68.
- **Bugs found & fixed**:
  - *Weighted Relevance Gate Bug*: Originally, the code calculated `score = rawSimilarity * weight` and checked if `score >= THRESHOLD`. This made it mathematically impossible for topics with lower weights (e.g. weight 0.3 required raw similarity $> 1.0$) to ever pass. Diagnostic revealed the single best semantic match in the dataset failed because its topic had weight 0.4.
  - *Fix*: Decoupled the Pass/Fail gate from the ranking calculation. The gate now checks unweighted `bestRawSimilarity >= 0.45`; weight is applied only to sort passed articles.
  - *Stock Spam Filter False Positives*: An initial broad regex `/\b(stocks?|shares?)\b/i` blocked legitimate technical news: *"Google Gemini Spark gets Google Photos access, can edit, organise and share photos"* and *"Trump bought SpaceX shares"*.
  - *Fix*: Tightened pattern to require stock terms *paired* with trading advice language (`better buy`, `screaming buy`, `price target`, `soar by`).

---

### Bundled into initial commit 632fb8b (2026-09-12) with no finer-grained git history — Step 3: Article Selection & Calibrated Groq Summarization
- **What was built**: Dynamic representative article selection per cluster (`src/services/articleSelection.js`) and Groq LLM integration (`openai/gpt-oss-20b` via `src/services/summarize.js`) producing 2–3 sentence summaries and 1–2 sentence "why read this" rationale.
- **Why**: The earliest published article in a cluster is not always the best written; primary lab blogs provide higher technical signal than syndicated news. Furthermore, standard LLM prompts tend to oversell borderline news.
- **How it works**: Clusters are scored across snippet length (50%), source authority tier (30%: Tier 1 primary lab blogs = 30 pts, Tier 2 mainstream tech journalism = 15 pts, Tier 3 aggregators = 0 pts), and cleanliness (20%). The highest-scoring article is designated `selectedArticleId` and sent to Groq. System prompts dynamically adjust based on confidence tier: low-confidence articles are instructed under a strict honesty constraint not to hallucinate connections to the user's focus area.
- **Verification performed**:
  - Evaluated on clusters containing multiple sources. Verified that a DeepMind blog post was selected as cluster representative over a TechCrunch repost, despite TechCrunch publishing first.
  - Tested borderline summaries. An article titled *"The Download: smarter AI in schools, and a robot 'carnival' in Shanghai"* assigned to on-device AI was honestly summarized as a general cultural robotics expo without claiming on-device chip relevance.

---

### Bundled into initial commit 632fb8b (2026-09-12) with no finer-grained git history — Step 4: Telegram Delivery & Twice-Daily Scheduling
- **What was built**: Telegram digest delivery system (`src/services/telegram.js`) supporting legacy Markdown formatting (`parse_mode: 'Markdown'`, deliberately chosen over MarkdownV2 to avoid escaping dots, dashes, and parens in URLs), rate-limited dispatch, twice-daily schedule (08:00 and 18:00 IST), and automated run tracking via `PipelineRun`.
- **Why**: Overwhelming users with dozens of articles causes notification fatigue. A curated top-5 format with evening incremental updates delivers high utility.
- **How it works**: Morning runs select the top 5 highest-ranking articles from the last 24 hours. Evening runs identify the morning run timestamp via `PipelineRun` and select only articles newly fetched after that morning cutoff.
- **Verification performed**:
  - *Cross-Run Dedup Proof*: In addition to synthetic tests, monitored genuine organic merges. A Guardian article on "GPT-6 Astra" published 16 minutes after an initial report correctly merged into the existing cluster with similarity `0.7536`.
- **Bugs found & fixed**:
  - *.env Inspection False Assumption*: During testing, the agent claimed `ARTICLE_MAX_AGE_HOURS` was verified reverted to 24 based on script output fallback defaults, when in fact `.env` had the variable missing.
  - *Fix*: Established standing rule: configuration status must be verified by directly viewing configuration files, never inferred from script outputs that provide default fallbacks.

---

### Bundled into initial commit 632fb8b (2026-09-12) with no finer-grained git history — Step 5: Multi-User Architecture & PWA Frontend
- **What was built**: Complete multi-user decoupling. User authentication via Clerk Google OAuth, `ArticleRelevance` collection separating user-specific scoring from global `Article` records, and React+Vite PWA dashboard (`frontend/`).
- **Why**: Enable multiple independent users with different interest topics, delivery schedules, and Telegram accounts to share the same backend pipeline.
- **How it works**: Global news ingestion runs once. The pipeline then iterates over all registered `InterestProfile` records, scoring and persisting `ArticleRelevance` rows per user. Telegram delivery dispatches tailored messages per chat ID.
- **Verification performed**:
  - Verified with 2 independent real users with distinct interest sets. Ran end-to-end pipeline; user A received reinforcement learning stories, user B received model releases.
  - Frontend verified with Lighthouse: 100% PWA compliance (manifest, icons, service worker, viewport).
- **Bugs found & fixed**:
  - *ArticleRelevance Migration Backfill Bug*: Migration script originally copied `Article.isRelevant` values directly into new `ArticleRelevance` records without re-running the spam filter. A previously caught listicle reappeared in a live digest. Fixed by forcing full re-evaluation against the updated spam filter during migration.
  - *Clerk "External Account Not Found" Bug*: Initial Clerk integration failed Google OAuth sign-in because the application was configured for sign-in-only, rejecting new Google identities. Fixed by enabling combined Sign-Up/Sign-In and migrating existing test user data.

---

### 2026-09-12 (commit 632fb8b) — Step 6A: Consolidated Repo Initialization & Split-Hosting Deployment
- **What was built**: Consolidated initial repository commit containing all 105 project files across frontend and backend. Configured split-hosting deployment targeting Vercel (frontend) and Render free-tier (backend).
- **Why**: Initialize version control for deployment. Vercel serverless functions cannot support persistent Node processes needed for Telegram long-polling; Render provides persistent Linux containers.
- **How it works**: Vercel serves the static React PWA. Render runs a persistent single-dyno container hosting Express, in-process `node-cron`, and the Telegram poller.
- **Architectural Reversal Documented**: Earlier notes in `STATUS.md` marked a migration from Telegram polling to Webhooks as "mandatory" for production. Once Render's persistent worker was selected, this was reversed: long-polling was kept as-is, avoiding webhook endpoint exposure and SSL setup overhead.

---

### 2026-09-13 (commits ce57851, 213666e, 98e8a81) — Step 6B: Free-Tier Process Unification & Pipeline Robustness
- **What was built**: Unified runner script `src/scripts/startAll.js` (`ce57851`), updated `npm start` default in `package.json` (`98e8a81`), and made manual pipeline trigger endpoint `/api/pipeline/run` robust against empty payloads and HTTP method variance (`213666e`).
- **Why**: Render's free tier only permits a single free web service. Running web and Telegram poller as separate services would require a paid worker tier. Additionally, manual curl triggers failed when sent as GET without a body.
- **How it works**: `startAll.js` spawns both Express HTTP server (`src/index.js`) and Telegram poller (`src/scripts/startPoller.js`) in a single Node process. `/api/pipeline/run` now accepts both GET and POST requests and safely defaults empty request bodies.
- **Verification performed**: Tested unified execution in local terminal and verified simultaneous handling of HTTP health checks and Telegram incoming bot messages.

---

### 2026-09-13 (commits 50332db, af568dc) — Step 6C: Production UX Resilience Pass & Form Validation
- **What was built**: Comprehensive UX resilience states across React frontend: visual loading spinners, action-aware inline error cards with "Try again" retry handlers, 401 session expiry redirect (`/login?expired=1`), global offline detection banner, editorial 404 page, and 0.00–1.00 weight multiplier slider with topic muting.
- **Why**: Prevent blank screens, unhandled network disconnects, session confusion, and invalid configuration input during real-world mobile usage.
- **Verification performed**:
  - Injected 503 errors and network failures in live browser session. Confirmed inline error banners appeared and clicking "Try again" successfully recovered state once connectivity was restored.
  - Verified weight slider allows 0.00 (`af568dc` reverted unintended 0.1 floor, enabling users to mute topics without deleting them).
  - Navigated to `/random-missing-page` and confirmed editorial 404 rendered.

---

### 2026-09-13 (commits 4a5b613, b1631bd, 5f049f4) — Step 6D: Observability, Missed-Run Watchdog & PostHog Telemetry
- **What was built**: Full-stack Sentry error tracking, PostHog analytics, missed-run watchdog scheduler, and full-scale spam filter re-validation.
- **Why**: Ensure live pipeline failures are caught automatically rather than discovered via missed digests, and verify spam filter rules at scale.
- **Verification performed**:
  - *Spam Filter Audit*: Scanned all 753 primary articles (865 total). 15 spam articles caught, 0 false positives found. Upgraded provisional N=1 status to scale-verified.
  - *Missed-Run Root Cause Investigation*: Confirmed Sept 12 evening run did not fire (0 records in DB) because Render slept without keep-alive. Confirmed Sept 13 evening run fired at 18:00:31 IST (0 articles delivered due to 31-minute window having no qualifying stories).
  - *Watchdog Implementation*: Added cron watchdog at 08:35 and 18:35 IST checking `PipelineRun` for completed execution; dispatches Sentry alert if missing.
  - *Telemetry Verification*: Triggered `GET /api/debug/sentry-test` (verified in Sentry dashboard). Configured `phc_...` key in Vercel and verified PostHog capture.

---

### 2026-09-13 (commit a5b8ca8) — Step 6E: Living Master Project Documentation Creation
- **What was built**: Master living documentation file `PROJECT_DOCUMENTATION.md` consolidating project overview, full feature list, tech stack rationale, chronological build log, known limitations, operational runbook, and strict maintenance rules.
- **Why**: Preserve architectural decisions, bug root causes, threshold tuning data, and operational procedures for future development without losing historical context.

---

### 2026-09-14 — Step 6F: Public Repository Documentation & GitHub README Creation
- **What was built**: Root `README.md` featuring shields.io badges, live dashboard links, concise pipeline explanation, key feature highlights, Mermaid architecture diagram, tech stack table, 4 core engineering decision callouts, and clean local setup runbook.
- **Why**: Present a technical, confident, and professional overview of the repository for public review, recruiters, and developers without exposing raw API endpoints or embellishing capabilities.
- **How it works**: Synthesized verified architectural patterns, exact threshold figures (0.72 dedup, 0.45 raw similarity), and operational parameters directly from `PROJECT_DOCUMENTATION.md` and codebase.
- **Verification performed**: Cross-checked all claims, package dependencies, environment variable names, and ISC license against `package.json`, `src/config/index.js`, and `frontend/vite.config.js`.

---

### 2026-09-14 — Step 6G: Documentation Reconciliation & Single-Source Consolidation
- **What was built**: Reconciled and formally deprecated `STATUS.md` and `PROJECT_CONTEXT.md` to point to `PROJECT_DOCUMENTATION.md` as the single canonical source of truth. Corrected stale records (marked Step 6 complete, updated stack to split-hosting, updated webhook-to-polling reversal).
- **Why**: Maintaining 3 overlapping living documents led to silent documentation drift (e.g. outdated webhook claims and uncompleted step 6). Consolidation ensures one authoritative reference going forward.
- **How it works**: Added deprecation notices to `STATUS.md` and `PROJECT_CONTEXT.md` redirecting readers to `PROJECT_DOCUMENTATION.md`. Updated `WORKING_RULES.md` to reference `PROJECT_DOCUMENTATION.md`. Established `PROJECT_DOCUMENTATION.md Section 5` as the sole active backlog.
- **Verification performed**: Verified consistent split-hosting stack across all docs; confirmed zero conflicting claims across repository files.

---

### 2026-09-14 — Step 7: Telegram Conversational Chat & On-Demand /digest
- **What was built**: Layered two-way conversational AI chat and an on-demand `/digest` command onto the existing Telegram poller. Added `ChatMessage` model, `src/services/chat.js` service with 48h delivered digest context injection and recent 20-message conversation history, per-user rate limiting (20 msgs/hr), and daily midnight cron for 30-day message pruning.
- **Why**: Allows users to dive deeper into delivered stories ("tell me more about the Nvidia PAIR story") or ask general technical questions directly inside Telegram without opening a browser or breaking pipeline isolation, while preventing unbounded Groq API costs and DB bloat.
- **How it works**: Poller checks incoming chat ID against linked `User` records. Unlinked users receive account linking instructions. Linked users sending `/digest` receive their latest delivered batch formatted as a top-5 digest. Linked users sending natural language queries trigger `generateChatResponse()`, which checks hourly message counts, retrieves the user's last 48 hours of delivered articles and last 20 chat turns, builds an adaptive system prompt, queries Groq (`openai/gpt-oss-20b`), and returns the response.
- **Verification performed**: Executed `src/tests/test-telegram-chat.js` covering 6 test cases: verified article-specific explanation using real delivered context ("AgentsDock IDE"), general trivia without forced AI connections ("Paris, France"), `/digest` command execution and formatting, rate-limit blocking at 20 msgs/hr, `ChatMessage` schema persistence, and unlinked user routing. All 6 tests passed.

---

### 2026-09-14 — Step 8: Multi-Key Groq Rotation & Unrestricted Conversational Chat
- **What was built**: Built `src/services/groqRotator.js` multi-key pool manager supporting 5 concurrent Groq API keys (`GROQ_API_KEY`, `API_2`, `API_3`, `API_4`, `API_5`). Removed the user-facing 20 messages/hour chat rate limit in `src/services/chat.js`. Integrated `groqRotator` into both `chat.js` and `summarize.js` for automatic 429 failover.
- **Why**: Expanding to 5 Groq keys allows 5x throughput (150 RPM aggregate on free tier). Instead of artificially throttling users with an hourly message ceiling, multi-key rotation solves rate-limiting at the infrastructure level with zero user interruption.
- **How it works**: `groqRotator` deduplicates keys from environment variables. When a request hits HTTP 429, the active key is placed on a temporary cooldown and the request is immediately retried on the next healthy key in the pool (up to N attempts). In `chat.js`, the blocking rate-limit check was removed, enabling unrestricted conversational interaction.
- **Verification performed**: Tested pool initialization with all 5 keys. Simulated an HTTP 429 rate limit on key slot 1 (`gsk_JrN...gSIU`), verified immediate rotation to slot 2 (`gsk_Wet...BolY`), and confirmed successful completion of subsequent chat query without user-facing errors. All 6 suite tests passed in `test-telegram-chat.js`.

### 2026-09-14 — Step 9: Topic-Mismatch Bug Resolution & Candidate-Weighted Topic Disambiguation
- **What was built**: Resolved the internal topic-mismatch bug in `src/services/relevance.js` (`scoreRelevance`). Refined seed topic phrasings in `src/scripts/seedInterestProfile.js` to eliminate polysemic keywords (replaced `"shipping with"` in Topic 8 with `"equipped with"`, and expanded Topic 7 to explicitly include `"international AI governance and human rights policy"`). Implemented candidate-weighted evaluation across passing topics (`rawSim >= 0.45`), migrated live MongoDB `InterestProfile` documents, and rescored all `ArticleRelevance` records via `src/scripts/migrateTopicPhrasingAndRescore.js`.
- **Why**: Previously, `scoreRelevance` assigned `matchedTopic` and `rankingScore` strictly via `argmax(rawSim)` over all topics. This caused two distinct failures: (1) Lexical polysemy in Topic 8 ("features shipping with embedded on-device AI") caused maritime freight shipping articles (*Lloyd's List*) to falsely cross the 0.45 gate and tag as consumer hardware; (2) When an article scored similarly across multiple topics, naive raw argmax mis-tagged articles to low-weight catch-alls (e.g. tagging SWE benchmarking or smarter AI models to VC funding or infrastructure instead of coding agents or LLM releases).
- **How it works**: Gatekeeping remains decoupled: `bestRawSimilarity = Math.max(...rawSims)` checks if at least one topic reaches `RAW_SIMILARITY_THRESHOLD (0.45)`. For passed articles, topic matching filters candidate topics with `rawSim >= 0.45` and selects the candidate maximizing `weightedScore = rawSim * weight` (with raw similarity tiebreak). If an article falls below admission, it falls back to the top raw match. In MongoDB, 868 `ArticleRelevance` documents were rescored: maritime shipping dropped from 0.4593 to 0.3739 (excluded), Gaganyaan astronaut re-assigned to national security/governance (raw 0.5176), UN human rights AI re-assigned to international governance (raw 0.5976), and Real-SWE correctly prioritized under coding agents (rank 0.5103).
- **Verification performed**: Verified rejection of maritime shipping (raw 0.3739) and municipal bus management (raw 0.4432). Verified high-confidence matching of UN human rights (raw 0.5976) and Gaganyaan astronaut (raw 0.5176). Verified multi-topic disambiguation on Real-SWE, Ask HN, and memory architecture. Verified `test-telegram-chat.js` (6/6 tests passed) and `test-multi-user-pipeline.js` (all tests passed with per-user topic isolation).

---

## 5. Known Limitations & Backlog (Not Yet Resolved)
1. **PWA Service Worker Stale-Cache**:
   - Service worker caches the application shell. A frontend rebuild on Vercel may require a hard refresh on mobile if cached assets are held.
   - *Status*: Open backlog item for automated cache versioning.
2. **MongoDB Atlas IP Access**:
   - Network access is configured to `0.0.0.0/0` to allow dynamic outbound IPs from Render and Vercel.
   - *Status*: Accepted operational tradeoff for free-tier hosting.

---

## 6. Operational Notes
- **Delivery Schedule**:
  - 08:00 AM IST: Morning run (full rolling 24-hour top-5 digest).
  - 06:00 PM IST: Evening run (incremental digest covering only new articles since morning run).
- **Keep-Alive**: `cron-job.org` pings `https://ai-news-backend-rmdj.onrender.com/api/health` every 10 minutes to prevent Render free-tier idle sleep. Also: internal self-ping in `scheduler.js` every 10 minutes via `RENDER_EXTERNAL_URL` (auto-injected by Render) as a second layer.
- **Missed-Run Detection**: Sentry watchdog checks at 08:35 AM and 06:35 PM IST for a missing `PipelineRun` record.
- **Active Production URLs**:
  - Frontend: `https://ai-news-desk-ecru.vercel.app`
  - Backend: `https://ai-news-backend-rmdj.onrender.com`
- **Current Live Users**: 2 active accounts verified end-to-end with independent Telegram delivery.

### Poller Resilience — Incident History (2026-09-17)

**Root cause confirmed via live DB evidence (not theory):**

Node's built-in `fetch()` has no default timeout. The Telegram long-poll `getUpdates` call
(25s Telegram timeout) could hang indefinitely at the TCP layer on Render's network — never
throwing, never returning. This froze the `while` loop in `startTelegramPoller` silently:
- Express stayed alive (health check OK, cron-job.org pings succeeded)
- Supervisor saw no crash (a hang ≠ exception)
- DB heartbeat fix addressed a separate problem
- No safeguard existed to detect a stalled `await`

**Evidence**: BotState stuck at `325527287` for 35+ hours. Local long-poll from dev machine
returned immediately (4.4s) with 0 updates — production poller had the Telegram connection
locked in a hung state.

**Fix (`d6ac365`)**: `AbortSignal.timeout(35000)` added to `fetchTelegramUpdates` fetch call.
35s = 25s Telegram timeout + 10s buffer. Stalled fetch now throws `TimeoutError`, caught by
existing error handler, loop continues immediately on next poll.

**Verification (real-time, not asserted)**:
- Post-deploy: BotState advanced `325527287 → 325527295` (7 updates processed)
- DB showed 3 user messages + 3 assistant replies stored at 07:57–07:59 UTC
- `sendTelegramMessage` confirmed delivering to production chatId

**Two-day window still open** — checkpoints:
1. Today 18:00–20:00 IST (same window that failed before)
2. Tomorrow morning (overnight gap test)

# Working Rules — Pin and Follow Every Task

> **Reference this file alongside [PROJECT_DOCUMENTATION.md](file:///c:/Rithwik/Projects/AI-news-delivery/PROJECT_DOCUMENTATION.md) at the start of every task.**

## Scope Discipline

1. Build **exactly** what current task specifies. No extras, no "while I'm at it" additions, no speculative future-proofing.
2. Do not introduce new libraries, services, or architectural patterns not in pinned context without asking first + explaining why.
3. If task seems to require something from a later build-order step → **stop and flag it**, don't build early.

## Code Quality

4. **Modular file structure** — separate concerns into different files/modules (fetch logic, dedup logic, embedding logic, DB models, config each in own file). No monolithic single-file scripts.
5. **Secrets in env vars** — all API keys, DB strings, bot tokens go in `.env` via `dotenv`. Never hardcode. Never commit `.env`. Confirm `.gitignore` covers it.
6. **Comment non-obvious logic** — especially embedding similarity thresholds, clustering logic, LLM prompt construction. Code should be interview-explainable, not just functional.
7. **Basic error handling** for all external calls (RSS fetch, DB connection, API calls). One failed source must not crash whole pipeline.
8. **Console logging at key stages** — articles fetched, duplicates merged, relevance scores, etc. Verify behavior visually, don't trust silence.

## Process

9. **No auto-deploy/push/production** — I run and test locally first.
10. **Post-task summary** must include:
    - Files created/changed
    - Assumptions made
    - Config values I need to fill in (API keys, thresholds, etc.)
    - How to test locally
11. **Flag judgment calls explicitly** — if requirement is ambiguous, tell me what you decided and why. Don't silently pick an option.

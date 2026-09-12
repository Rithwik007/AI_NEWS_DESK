# AI News Delivery Pipeline — Project Context

> **PIN THIS**: Reference this file at the start of every task in this project.

## What We're Building

AI-powered daily news pipeline:
1. Fetches AI-related news from multiple RSS sources
2. Deduplicates articles covering the same story (embedding clustering)
3. Filters by relevance to user's interest profile (embedding similarity)
4. Generates summary + "why you should read this" reason (Groq LLM)
5. Delivers digest via Telegram

## NOT a RAG System

Embeddings used for:
- **Similarity clustering** (dedup)
- **Relevance scoring** (filtering)

NOT for retrieval-grounded QA. No vector DB for long-term retrieval. No chunking strategy.

## Stack

| Component    | Technology                                      |
| ------------ | ----------------------------------------------- |
| Backend      | Node.js + Express                               |
| Database     | MongoDB (Atlas)                                 |
| LLM          | Groq API (summaries + reasoning only, NOT embeddings) |
| Embeddings   | transformers.js (in-process Node, NOT Python)   |
| Delivery     | Telegram Bot API                                |
| Deployment   | Vercel + Vercel Cron                            |
| VCS          | GitHub                                          |

## Build Order

1. `[x]` RSS fetch + deduplication via embedding clustering
2. `[x]` Relevance filtering against hardcoded interest profile (embedding similarity)
3. `[x]` Summarization + "why read this" via Groq
4. `[x]` Telegram delivery to single hardcoded chat ID
5. `[x]` MongoDB multi-user schema, Clerk auth, frontend dashboard
6. `[ ]` Deploy properly, add Sentry, add PostHog

## NOT Building Yet

- No frontend (React/Vite — later)
- No authentication (Clerk — later)
- No multi-user support (single hardcoded user/config for now)
- No analytics (PostHog — later)
- No custom domain/DNS (Cloudflare — later, if at all)

## Rules for Every Task

- Each task prompt is scoped to **exactly one step**
- Confirm scope understanding before writing code
- If something requires functionality from a future step → **stop and ask**
- Do not build ahead of schedule

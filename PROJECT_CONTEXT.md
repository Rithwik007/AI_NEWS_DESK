# AI News Delivery Pipeline — Project Context

> **DEPRECATED**: This document is preserved for historical sprint context only. [PROJECT_DOCUMENTATION.md](file:///c:/Rithwik/Projects/AI-news-delivery/PROJECT_DOCUMENTATION.md) is now the **single canonical source of truth** for all project context, architecture, stack, and rules.

## What We Built

AI-powered daily news pipeline:
1. Fetches AI-related news from 15 technical RSS/API sources
2. Deduplicates articles covering the same story (in-process ONNX embeddings + Union-Find)
3. Filters by relevance to user's interest profile (decoupled unweighted admission gate)
4. Generates summary + calibrated "why you should read this" reason (Groq LLM)
5. Delivers digests via Telegram twice daily (08:00 & 18:00 IST)
6. Self-serve React 18 PWA dashboard with Clerk Google OAuth

## NOT a RAG System

Embeddings used for:
- **Similarity clustering** (dedup)
- **Relevance scoring** (filtering)

NOT for retrieval-grounded QA. No vector DB for long-term retrieval. No chunking strategy.

## Stack

| Component    | Technology                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| Backend      | Node.js + Express (Render persistent container)                                                               |
| Database     | MongoDB (Atlas)                                                                                               |
| LLM          | Groq API (`openai/gpt-oss-20b` for summaries + reasoning only, NOT embeddings)                               |
| Embeddings   | `@huggingface/transformers` (`all-MiniLM-L6-v2` in-process Node, NOT Python)                                   |
| Delivery     | Telegram Bot API (legacy Markdown mode)                                                                       |
| Frontend     | React 18 + Vite (PWA hosted on Vercel CDN)                                                                    |
| Auth         | Clerk (Google OAuth)                                                                                          |
| Observability| Sentry (full stack) + PostHog (client analytics) + cron-job.org (keep-alive)                                  |
| Deployment   | Split hosting: Render (backend API + persistent worker + in-process cron) & Vercel (static PWA)               |
| VCS          | GitHub                                                                                                        |

## Build Order

1. `[x]` RSS fetch + deduplication via embedding clustering
2. `[x]` Relevance filtering against interest profile (embedding similarity)
3. `[x]` Summarization + "why read this" via Groq with calibrated honesty
4. `[x]` Telegram delivery with twice-daily morning/evening schedules
5. `[x]` MongoDB multi-user schema, Clerk auth, frontend PWA dashboard
6. `[x]` Split-hosting deployment (Render + Vercel), Sentry error monitoring, PostHog analytics, missed-run watchdog


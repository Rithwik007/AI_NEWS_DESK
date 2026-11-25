# AI News Desk

AI News Desk delivers a personalized AI news briefing to Telegram twice a day. Choose the topics you follow and how much each one matters to you. [Open AI News Desk](https://ai-news-desk-ecru.vercel.app/)

## Get your first briefing

1. Open the dashboard and sign in.
2. In **Delivery Channels**, generate a linking code, open the desk’s Telegram bot, and send the prefilled start command.
3. In **Interests**, pick suggested topics or add your own, adjust their weights, and save.

In **Digest**, choose morning only (**8:00 AM**), evening only (**6:00 PM**), or both editions. All times are India Standard Time. New accounts receive both editions by default. Once your chat is linked and your interests are saved, you can close the dashboard and turn off your laptop. Send `/digest` to the bot to request your latest briefing.

## How the desk picks stories

The backend collects articles from RSS feeds, Google News searches, and Hacker News. It uses text embeddings to group coverage of the same story and rank articles against each reader’s interests. Groq summarizes selected stories, and the Telegram bot delivers the briefing with links to the sources.

The morning edition considers the previous 24 hours of coverage. For twice-daily readers the evening edition focuses on stories collected since the morning run. Evening-only readers also get eligible coverage from earlier in the day.

## Hosted architecture

| Component | Role |
| --- | --- |
| React and Vite on Vercel | Reader dashboard for sign-in, interests, delivery settings, and edition times |
| Clerk | Reader accounts and authenticated API requests |
| Node.js and Express on Render | Feed collection, ranking, scheduling, and Telegram webhooks |
| MongoDB Atlas | Reader profiles, linked chats, articles, rankings, and delivery history |
| Transformers.js and Groq | Article embeddings and summaries |
| Telegram Bot API | Scheduled delivery and on-demand digest requests |
| Sentry and PostHog | Error reporting and product analytics |

Built by Rithwik Racharla.

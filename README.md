# AI News Desk

AI News Desk reads AI news feeds, groups coverage of the same story, ranks stories against each reader’s interests and delivers a personal digest to your Telegram chat. Use the dashboard to choose topics and link your Telegram bot. [Open the hosted dashboard](https://ai-news-desk-ecru.vercel.app).

## Set it up with Codex, Claude Code or Antigravity

Clone or download this repository, open its folder in your coding agent, and paste this prompt:

> Set up AI News Desk on my computer. Ask me to choose login (no login or Clerk) and storage (local SQLite file or MongoDB). Default to no login and SQLite. Telegram is required in every mode. Apply my choices in the root .env using the settings below. Preserve existing keys, install both sets of dependencies, and run the tests and frontend build. Tell me exactly which keys to enter locally. Once I have supplied them, start the desk, verify database health and help me link my own Telegram bot. Keep secrets out of chat and Git.

For a preview without credentials, use **Try the frontend** below. For a working personal desk, follow **Run your own desk**.

## How a story reaches you

1. The Express service schedules a morning run at 08:00 and an evening run at 18:00 in Asia/Kolkata. It fetches RSS, Google News searches and Hacker News results.
2. Transformers.js embeds article text locally. The pipeline clusters related stories, checks recent MongoDB articles for duplicates, screens spam and ranks candidates by topic similarity and priority.
3. Groq summarizes selected stories. The morning edition covers the prior 24 hours. The evening edition selects newly ingested coverage.
4. Your Telegram bot sends the digest to your linked chat. Send `/digest` in that chat to request your latest edition.

## Try the frontend

Use 64-bit Node.js 22.19 or newer with npm. On Windows, macOS or Linux, run the following in a terminal.

```sh
git clone https://github.com/Rithwik007/AI_NEWS_DESK.git
cd AI_NEWS_DESK
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open the local URL Vite prints. The public front page and interactive edition preview work without accounts or keys.

## Run your own desk

**Fresh clone checklist.** Install dependencies in both directories even if you skipped the preview. From the root, run:

```sh
npm ci
npm ci --prefix frontend
npm test
npm run build --prefix frontend
```

Run `npm run setup` from the root. It asks two questions: **Login** (none or Clerk) and **Database** (SQLite or MongoDB). Press Enter twice on a fresh clone for no login and SQLite. It creates the local env files and prints the keys your choices need. When you rerun setup, it updates only the two mode settings in your existing configuration. Restart both processes after changing modes.

For manual setup, copy `.env.example` to `.env` and `frontend/.env.example` to `frontend/.env`, then use the settings below.

### Choose login and storage

Set these independently in the root `.env`. A new copy of `.env.example` starts with these personal settings:

```dotenv
AUTH_MODE=none
DATABASE_MODE=sqlite
SQLITE_PATH=./data/newsdesk.sqlite
```

| Choice | What to set | What happens |
| --- | --- | --- |
| No login | `AUTH_MODE=none` | One reader on this computer. The API binds to loopback. Open the dashboard on localhost. |
| Clerk login | `AUTH_MODE=clerk` | Each signed-in reader gets their own profile and Telegram link. |
| Local storage | `DATABASE_MODE=sqlite` | The backend creates a SQLite file on first startup. Interests, articles, Telegram links and delivery history survive browser and server restarts. |
| MongoDB | `DATABASE_MODE=mongodb` | Set `MONGODB_URI` to your Atlas URI with a database name or to a running local MongoDB instance. |

Both login choices work with either database. Existing deployments that omit both settings use Clerk and MongoDB. Switching storage opens the selected database; it does not migrate your records. Switching login changes which reader profile the dashboard opens.

### Fill in your keys

| Local file | Field | When and what to enter |
| --- | --- | --- |
| `.env` | `GROQ_API_KEY` | Always. One Groq API key for summaries. |
| `.env` | `TELEGRAM_BOT_TOKEN` | Always. Create a dedicated bot with BotFather using `/newbot`, then paste its token here. |
| `frontend/.env` | `VITE_TELEGRAM_BOT_USERNAME` | Always. Enter that bot’s username without `@`. |
| `.env` | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk login only. Use keys from the same Clerk application. |
| `frontend/.env` | `VITE_CLERK_PUBLISHABLE_KEY` | Clerk login only. Copy the publishable key. Keep the secret key on the backend. |
| `.env` | `MONGODB_URI` | MongoDB only. For Atlas, give the app database access and allow connections from the backend host. |
| `.env` | `TELEGRAM_WEBHOOK_URL` | Clerk mode. Your public HTTPS backend or tunnel URL followed by `/api/telegram/webhook`. |

### Start the app and link Telegram

1. From the repository root, run `npm start`. In a second terminal run `npm run dev --prefix frontend`. Open the localhost URL Vite prints. The local API defaults to port 3000. Check [API health](http://localhost:3000/api/health) for a connected database.
2. **No login:** Open the desk locally. The backend receives Telegram updates through outbound polling, so a new dedicated bot works without a webhook or public tunnel. Keep both the API and the Vite dev server on loopback. Use one running instance per bot.
3. **Clerk login:** Sign in with your configured Clerk app. Expose your backend through HTTPS and run `node src/scripts/setTelegramWebhook.js`, then `node src/scripts/setTelegramWebhook.js --info`. Both the server and the script derive the verification secret from the token. If you override `TELEGRAM_WEBHOOK_SECRET`, use the same value on both.
4. In **Delivery Channels**, generate a Telegram code and open your bot to send the start command. Save a topic in **Interests**, then send `/digest` in Telegram. First use of the embedding model needs internet access and writable cache space.
5. For automatic editions, set `DISABLE_SCHEDULER=false` and restart the backend. Keep it running at **08:00 and 18:00 Asia/Kolkata**. The default example disables scheduling while you set up.

### Deployment

Use Clerk for a shared or public desk. Run one persistent backend with scheduling enabled. SQLite needs a persistent disk mounted at `SQLITE_PATH`; MongoDB uses your external database. Set `FRONTEND_URL` to the dashboard origin. For Vercel, use `frontend` as the root, `npm run build` as the command and `dist` as the output. Set `VITE_AUTH_MODE=clerk`, `VITE_API_BASE_URL` to your own HTTPS backend, the Clerk publishable key and the Telegram bot username on the frontend host. Register the backend’s webhook and configure the dashboard domain in Clerk. Restart Vite or rebuild after changing login or frontend settings.

### Verification

If you use an external keep-alive job, point it at `GET /api/health` on your backend every ten minutes. Check its execution history for timely HTTP 200 responses. The app schedules editions internally. A health check alone cannot confirm digest delivery.

Groq accepts a primary key and up to four optional failover keys in the example configuration. For observability, configure the backend Sentry DSN on the API host and the frontend Sentry DSN and PostHog project key on the frontend host. Rebuild the frontend after changing its public configuration.

Run `npm test` for offline checks and `npm run build --prefix frontend` to compile the dashboard. Other scripts in `src/tests` include historical diagnostics and integrations that change database records, create sessions or send messages. Use disposable accounts, a separate database and a dedicated bot for integration testing.

For end-to-end acceptance, sign in to your instance, save a topic, reload to confirm persistence, link your own chat and request `/digest`. Check the next scheduled run and your receiving device. A successful health response confirms API and database availability. Scheduled delivery also depends on source feeds, Groq, the bot webhook and your channel settings.

Created by Rithwik Racharla.

# AI News Desk

AI News Desk reads AI news feeds, groups coverage of the same story, ranks stories against each reader’s interests and delivers a personal digest. The React dashboard manages topics and delivery channels. [Open the hosted dashboard](https://ai-news-desk-ecru.vercel.app).

## How a story reaches you

1. The Express service schedules a morning run at 08:00 and an evening run at 18:00 in Asia/Kolkata. It fetches RSS, Google News searches and Hacker News results.
2. Transformers.js embeds article text locally. The pipeline clusters related stories, checks recent MongoDB articles for duplicates, screens spam and ranks candidates by topic similarity and priority.
3. Groq summarizes selected stories. The morning edition covers the prior 24 hours. The evening edition selects newly ingested coverage.
4. Telegram delivers the digest. For invited WhatsApp numbers the service attempts a Meta template first and can fall back to linked Telegram. Incoming bot commands and chat arrive through webhooks.

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

1. From the repository root run `npm ci`. Copy `.env.example` to `.env` and `frontend/.env.example` to `frontend/.env`. You can copy and rename both files in your file manager.
2. Start MongoDB locally or enter your own Atlas URI in `MONGODB_URI`. In Atlas, grant the app database access and allow connections from your backend host. First-time embedding inference downloads the model and needs outbound internet access and writable cache space.
3. Create a Clerk application. Enable the sign-in methods you want. Put its publishable key in both examples’ corresponding local env files and its secret key only in the root file. Add your Groq key and a Telegram token from BotFather. Set the bot username in the frontend file.
4. Generate a Telegram webhook secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Set it in the root file. Use a bot dedicated to your instance. Telegram sends updates to one webhook per bot.
5. Run `npm run start:web` and, in a second terminal, `npm run dev --prefix frontend`. Check [local API health](http://localhost:3000/api/health) for a connected database. The default Vite proxy targets port 3000. Restart Vite after editing frontend settings.
6. For bot linking and incoming commands, expose the backend through a public HTTPS deployment or tunnel. Set `TELEGRAM_WEBHOOK_URL` to its full `/api/telegram/webhook` URL. Run `node src/scripts/setTelegramWebhook.js` and then `node src/scripts/setTelegramWebhook.js --info`. Sign in, set your interests, open Delivery Channels, generate a code and follow the Telegram link. Use `npm start` for normal service startup with bot command registration.

### Optional WhatsApp delivery

Fill in the entire WhatsApp group in the root example using your Meta app secret, Cloud API access token, phone number ID, business account ID, a verification token you choose, and comma-separated invited numbers with country codes. Configure the Meta callback at your backend’s `/api/whatsapp/webhook`, subscribe to messages and approve the English `daily_digest_ready` template with its date parameter. Give invitees your WhatsApp business contact. In Delivery Channels, request a link code and send the displayed command to that contact from the invited phone. Existing WhatsApp users must confirm their number once after upgrading. Leave the group empty for Telegram-only use.

### Deployment

Run the backend as one persistent Node process with the scheduler active. Set `FRONTEND_URL` to the exact dashboard origin and configure the root variables on the host. For Vercel, select `frontend` as the project root, use `npm run build`, publish `dist` and set `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_TELEGRAM_BOT_USERNAME` before building. Configure the deployed domain in Clerk and register the production bot webhook. Set `DISABLE_SCHEDULER=false` on one always-on delivery host. The local example disables scheduling. At startup and every ten minutes the service checks MongoDB for the current India-time edition and runs it if missing. A sleeping backend needs an external wake-up or an always-on host. Completed editions from prior days are skipped.

### Verification

If you use an external keep-alive job, point it at `GET /api/health` on your backend every ten minutes. Check its execution history for timely HTTP 200 responses. The app schedules editions internally. A health check alone cannot confirm digest delivery.

Groq accepts a primary key and up to four optional failover keys in the example configuration. For observability, configure the backend Sentry DSN on the API host and the frontend Sentry DSN and PostHog project key on the frontend host. Rebuild the frontend after changing its public configuration.

Run `npm test` for offline checks and `npm run build --prefix frontend` to compile the dashboard. Other scripts in `src/tests` include historical diagnostics and integrations that change database records, create sessions or send messages. Use disposable accounts, a separate database and a dedicated bot for integration testing.

For end-to-end acceptance, sign in to your instance, save a topic, reload to confirm persistence, link your own chat and request `/digest`. Check the next scheduled run and your receiving device. A successful health response confirms API and database availability. Scheduled delivery also depends on source feeds, Groq, the bot webhook and your channel settings.

Created by Rithwik Racharla.

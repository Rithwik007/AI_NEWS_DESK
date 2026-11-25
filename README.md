# AI News Desk

AI News Desk reads AI news feeds, groups coverage of the same story, ranks stories against each reader’s interests and delivers a personal digest. The React dashboard manages topics and delivery channels. [Open the hosted dashboard](https://ai-news-desk-ecru.vercel.app).

## Set it up with Codex, Claude Code or Antigravity

Clone or download this repository, open its folder in your coding agent, and paste this prompt:

> Set up AI News Desk on this computer using this README. Check Node and npm, install dependencies with npm ci at the root and in frontend, and copy both .env.example files to their matching .env files only if missing. Keep scheduling disabled during setup. Build the frontend and run the offline tests. Then pause and tell me which fields to fill in locally for MongoDB, Clerk, Groq and Telegram. Ask whether I want WhatsApp. After I fill in the files, start the API and dashboard, check database health and help me link my own bot. Use my own services and keep secrets out of chat, logs and Git.

For a preview without credentials, use **Try the frontend** below. For a working personal desk, follow **Run your own desk**.

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

**Fresh clone checklist.** Install dependencies in both directories even if you skipped the preview. From the root, run:

```sh
npm ci
npm ci --prefix frontend
npm test
npm run build --prefix frontend
```

To create the env files on Windows PowerShell, use the following commands. On macOS or Linux, use `cp -n .env.example .env` and `cp -n frontend/.env.example frontend/.env`.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
```

### Where to put your keys

Edit these two local files. Paste values after the equals signs. Keep the example files blank for the next person.

| Local file | Field | What to enter |
| --- | --- | --- |
| `.env` | `MONGODB_URI` | Your Atlas connection string including a database name, or the example URI if MongoDB is running locally. |
| `.env` | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | The publishable and secret keys from the same Clerk application. |
| `.env` | `GROQ_API_KEY` | One Groq API key. Leave the extra key slots empty unless you have more. |
| `.env` | `TELEGRAM_BOT_TOKEN` | The token BotFather gives you after `/newbot`. |
| `.env` | `TELEGRAM_WEBHOOK_URL` | Your public HTTPS backend or tunnel address followed by `/api/telegram/webhook`. A local-only address cannot receive Telegram updates. |
| `frontend/.env` | `VITE_CLERK_PUBLISHABLE_KEY` | The same Clerk **publishable** key as above. Frontend values are visible to visitors. |
| `frontend/.env` | `VITE_TELEGRAM_BOT_USERNAME` | Your bot username without the leading `@`. |
| `frontend/.env` | `VITE_API_BASE_URL` | Leave empty for local development. For deployment enter your own backend origin. |

### Start the app and link Telegram

1. Start MongoDB locally or enter your own Atlas URI in `MONGODB_URI`. In Atlas, grant the app database access and allow connections from your backend host. First-time embedding inference downloads the model and needs outbound internet access and writable cache space.
2. Create a Clerk application. Enable the sign-in methods you want. Put its publishable key in both local env files and its secret key only in the root file. Add your Groq key and a Telegram token from BotFather. Set the bot username in the frontend file.
3. Use a Telegram bot dedicated to your instance. The server and registration script derive the same webhook verification secret from its token. To override it, set the same random `TELEGRAM_WEBHOOK_SECRET` on both. Register the webhook again whenever you rotate either credential.
4. Run `npm run start:web` and, in a second terminal, `npm run dev --prefix frontend`. Check [local API health](http://localhost:3000/api/health) for a connected database. The default Vite proxy targets port 3000. Restart Vite after editing frontend settings.
5. For bot linking and incoming commands, expose the backend through a public HTTPS deployment or tunnel. Set `TELEGRAM_WEBHOOK_URL` to its full `/api/telegram/webhook` URL. Run `node src/scripts/setTelegramWebhook.js` and then `node src/scripts/setTelegramWebhook.js --info`. Sign in, set your interests, open Delivery Channels, generate a code and follow the Telegram link. Use `npm start` for normal service startup with bot command registration.

### Optional WhatsApp delivery

Fill in the entire WhatsApp group in the root example using your Meta app secret, Cloud API access token, phone number ID, business account ID, a verification token you choose, and comma-separated invited numbers with country codes. Configure the Meta callback at your backend’s `/api/whatsapp/webhook`, subscribe to messages and approve the English `daily_digest_ready` template with its date parameter. Give invitees your WhatsApp business contact. In Delivery Channels, request a link code and send the displayed command to that contact from the invited phone. Existing WhatsApp users must confirm their number once after upgrading. Leave the group empty for Telegram-only use.

| Root `.env` field | Value for your own WhatsApp integration |
| --- | --- |
| `WHATSAPP_APP_SECRET` | App secret from your Meta app’s basic settings, used to verify incoming messages. |
| `WHATSAPP_ACCESS_TOKEN` | Cloud API token authorized to send messages for your business number. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | The two IDs in Meta’s WhatsApp API setup. The phone number ID is different from the dialable number. |
| `WEBHOOK_VERIFY_TOKEN` | A private value you choose. Enter the identical value when configuring the Meta callback. |
| `WHATSAPP_ALLOWED_NUMBERS` | Invited recipients in international format, separated by commas. Each recipient must also complete the link from their phone. |

After linking, send `/digest` or `digest` in the business chat to read your latest edition. Each story has a numbered headline, summary and source link when available. Scheduled WhatsApp delivery starts with the approved template. Linking after a morning run takes effect for the next scheduled edition.

### Deployment

Run the backend as one persistent Node process with the scheduler active. Set `FRONTEND_URL` to the exact dashboard origin and configure the root variables on the host. For Vercel, select `frontend` as the project root, use `npm run build`, publish `dist` and set `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_TELEGRAM_BOT_USERNAME` before building. Configure the deployed domain in Clerk and register the production bot webhook. Set `DISABLE_SCHEDULER=false` on one always-on delivery host. The local example disables scheduling. At startup and every ten minutes the service checks MongoDB for the current India-time edition and runs it if missing. A sleeping backend needs an external wake-up or an always-on host. Completed editions from prior days are skipped.

### Verification

If you use an external keep-alive job, point it at `GET /api/health` on your backend every ten minutes. Check its execution history for timely HTTP 200 responses. The app schedules editions internally. A health check alone cannot confirm digest delivery.

Groq accepts a primary key and up to four optional failover keys in the example configuration. For observability, configure the backend Sentry DSN on the API host and the frontend Sentry DSN and PostHog project key on the frontend host. Rebuild the frontend after changing its public configuration.

Run `npm test` for offline checks and `npm run build --prefix frontend` to compile the dashboard. Other scripts in `src/tests` include historical diagnostics and integrations that change database records, create sessions or send messages. Use disposable accounts, a separate database and a dedicated bot for integration testing.

For end-to-end acceptance, sign in to your instance, save a topic, reload to confirm persistence, link your own chat and request `/digest`. Check the next scheduled run and your receiving device. A successful health response confirms API and database availability. Scheduled delivery also depends on source feeds, Groq, the bot webhook and your channel settings.

Created by Rithwik Racharla.

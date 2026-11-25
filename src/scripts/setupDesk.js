const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '../..');

async function choose(rl, label, choices, current) {
  const fallback = choices.indexOf(current) + 1 || 1;
  for (;;) {
    const answer = (await rl.question(`${label}  1) ${choices[0]}  2) ${choices[1]}  [${fallback}] `)).trim();
    if (!answer) return choices[fallback - 1];
    if (answer === '1' || answer === '2') return choices[Number(answer) - 1];
    if (choices.includes(answer)) return answer;
    console.log('Enter 1 or 2.');
  }
}

async function main() {
  const envFile = path.join(root, '.env');
  const existing = fs.existsSync(envFile);
  let content = fs.readFileSync(existing ? envFile : envFile + '.example', 'utf8');
  const settings = dotenv.parse(content);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const auth = await choose(rl, 'Login', ['none', 'clerk'], settings.AUTH_MODE || (existing ? 'clerk' : 'none'));
    const db = await choose(rl, 'Database', ['sqlite', 'mongodb'], settings.DATABASE_MODE || (existing ? 'mongodb' : 'sqlite'));
    for (const [key, value] of Object.entries({ AUTH_MODE: auth, DATABASE_MODE: db })) {
      const line = new RegExp('^[ \\t]*(?:export[ \\t]+)?' + key + '\\s*=.*$', 'gm');
      content = line.test(content) ? content.replace(line, key + '=' + value) : content + '\n' + key + '=' + value + '\n';
    }
    fs.writeFileSync(envFile, content, { mode: 0o600 });
    const frontend = path.join(root, 'frontend', '.env');
    if (!fs.existsSync(frontend)) fs.copyFileSync(frontend + '.example', frontend, fs.constants.COPYFILE_EXCL);
    console.log('\nFill in GROQ_API_KEY and TELEGRAM_BOT_TOKEN in .env, and VITE_TELEGRAM_BOT_USERNAME in frontend/.env.');
    if (db === 'mongodb') console.log('Set MONGODB_URI in .env.');
    if (auth === 'clerk') console.log('Set the Clerk keys and TELEGRAM_WEBHOOK_URL in .env, and VITE_CLERK_PUBLISHABLE_KEY in frontend/.env. Register your Telegram webhook as described in the README.');
    else console.log('Use a dedicated Telegram bot without a webhook. The local desk polls it for messages.');
    console.log('Start the backend with npm start and the frontend with npm run dev --prefix frontend.');
  } finally {
    rl.close();
  }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });

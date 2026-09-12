import * as chromeLauncher from 'chrome-launcher';

async function inspect(urlPath) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox'],
  });

  try {
    const cdpUrl = `http://127.0.0.1:${chrome.port}/json`;
    const versionRes = await fetch(cdpUrl);
    const pages = await versionRes.json();
    const pageWsUrl = pages[0].webSocketDebuggerUrl;

    const WebSocket = (await import('ws')).default || (await import('ws'));
    const ws = new WebSocket(pageWsUrl);

    let id = 1;
    const pending = new Map();

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    const consoleLogs = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'Console.messageAdded') {
        consoleLogs.push(msg.params.message);
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    });

    await new Promise((resolve) => ws.on('open', resolve));

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Console.enable');

    console.log(`[CDP] Navigating to http://localhost:3000${urlPath} ...`);
    await send('Page.navigate', { url: `http://localhost:3000${urlPath}` });

    await new Promise((r) => setTimeout(r, 4000));

    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const root = document.getElementById('root');
        const clerkTarget = document.querySelector('[data-clerk-component]');
        const clerkContainer = document.getElementById('clerk-components');

        return {
          url: window.location.href,
          targetInnerHTML: clerkTarget ? clerkTarget.outerHTML : 'NO TARGET',
          clerkContainerHTML: clerkContainer ? clerkContainer.innerHTML.slice(0, 300) : 'NO CLERK CONTAINER',
          clerkContainerChildren: clerkContainer ? clerkContainer.children.length : 0,
        };
      })()`,
      returnByValue: true,
    });

    console.log(`\n--- RESULT FOR ${urlPath} ---`);
    console.log(JSON.stringify(evalRes.result.value, null, 2));
    console.log('Console logs:', consoleLogs.map(l => `[${l.level}] ${l.text}`));

    ws.close();
  } finally {
    try {
      await chrome.kill();
    } catch (e) {
      // ignore
    }
  }
}

async function runAll() {
  await inspect('/login');
  await inspect('/sign-up');
}

runAll().catch(console.error);

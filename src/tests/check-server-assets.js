async function check() {
  try {
    const h = await fetch('http://localhost:3000/api/health').then(r => r.json());
    console.log('API health:', h);
    const m = await fetch('http://localhost:3000/manifest.json').then(r => r.json());
    console.log('Manifest name:', m.name, 'icons:', m.icons.length);
    const sw = await fetch('http://localhost:3000/sw.js').then(r => r.text());
    console.log('SW size:', sw.length);
    const html = await fetch('http://localhost:3000/').then(r => r.text());
    console.log('HTML contains root:', html.includes('<div id="root"></div>'));
    console.log('HTML contains manifest:', html.includes('/manifest.json'));
  } catch (err) {
    console.error('Check failed:', err);
    process.exit(1);
  }
}
check();

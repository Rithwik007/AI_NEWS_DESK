import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';

async function run() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  try {
    const options = {
      logLevel: 'info',
      output: 'json',
      onlyCategories: ['accessibility', 'best-practices', 'performance'],
      port: chrome.port,
    };

    const runnerResult = await lighthouse('http://localhost:3000', options);
    
    // Save report
    const reportJson = runnerResult.report;
    const outputPath = path.resolve('lighthouse-report.json');
    fs.writeFileSync(outputPath, reportJson);
    console.log('[Lighthouse] Report written to', outputPath);

    const lhr = runnerResult.lhr;
    console.log('--- LIGHTHOUSE AUDIT RESULT ---');
    console.log('Categories:', Object.keys(lhr.categories));
    for (const category of Object.values(lhr.categories)) {
      console.log(`${category.title}: ${Math.round(category.score * 100)}`);
    }
  } finally {
    try {
      await chrome.kill();
    } catch (e) {
      console.log('[Chrome] Kill cleanup error ignored:', e.message);
    }
  }
}

run().catch(err => { console.error(err); process.exitCode = 1; });

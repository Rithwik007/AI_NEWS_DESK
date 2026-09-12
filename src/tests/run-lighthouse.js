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
      onlyCategories: ['pwa'],
      port: chrome.port,
    };

    const runnerResult = await lighthouse('http://localhost:3000', options);
    
    // Save report
    const reportJson = runnerResult.report;
    const outputPath = path.resolve('lighthouse-pwa-report.json');
    fs.writeFileSync(outputPath, reportJson);
    console.log('[Lighthouse] Report written to', outputPath);

    const lhr = runnerResult.lhr;
    console.log('--- LIGHTHOUSE AUDIT RESULT ---');
    console.log('Categories:', Object.keys(lhr.categories));
    if (lhr.categories.pwa) {
      console.log('PWA Score:', lhr.categories.pwa.score);
      console.log('\nAudit Checklist:');
      for (const auditRef of lhr.categories.pwa.auditRefs) {
        const audit = lhr.audits[auditRef.id];
        if (audit) {
          console.log(`[${audit.score === 1 ? 'PASS' : audit.score === 0 ? 'FAIL' : 'INFO'}] ${audit.title}: ${audit.displayValue || (audit.score === 1 ? 'Passed' : audit.explanation || 'See details')}`);
        }
      }
    } else {
      console.log('No PWA category in LHR. Checking individual PWA audits...');
      const pwaAudits = [
        'installable-manifest',
        'service-worker',
        'splash-screen',
        'themed-omnibox',
        'content-width',
        'viewport',
        'apple-touch-icon',
        'maskable-icon',
      ];
      for (const id of pwaAudits) {
        const audit = lhr.audits[id];
        if (audit) {
          console.log(`[${audit.score === 1 ? 'PASS' : audit.score === 0 ? 'FAIL' : 'INFO'}] ${audit.title} (${id}): ${audit.displayValue || (audit.score === 1 ? 'Passed' : audit.explanation || audit.description)}`);
        }
      }
    }
  } finally {
    try {
      await chrome.kill();
    } catch (e) {
      console.log('[Chrome] Kill cleanup error ignored:', e.message);
    }
  }
}

run().catch(console.error);

const cron = require('node-cron');
const { fetchAndDedup } = require('../pipeline/fetchAndDedup');

/**
 * Starts the in-process twice-daily pipeline scheduler.
 *
 * Runs:
 * - 08:00 AM IST: Morning run (full rolling 24h window)
 * - 06:00 PM IST: Evening run (incremental since morning run)
 *
 * Timezone: Asia/Kolkata (Indian Standard Time, UTC+5:30)
 */
function initScheduler() {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    console.log('[Scheduler] Scheduler disabled via DISABLE_SCHEDULER=true.');
    return;
  }

  console.log('[Scheduler] Initializing twice-daily pipeline scheduler (Asia/Kolkata)...');

  // Morning Run: 8:00 AM IST
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log('\n[Scheduler] ⏰ Triggering MORNING pipeline run (08:00 AM IST)...');
      try {
        await fetchAndDedup({ runType: 'morning' });
        console.log('[Scheduler] ✓ Morning pipeline run finished successfully.');
      } catch (err) {
        console.error('[Scheduler] ✗ Morning pipeline run failed:', err.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Evening Run: 6:00 PM IST
  cron.schedule(
    '0 18 * * *',
    async () => {
      console.log('\n[Scheduler] ⏰ Triggering EVENING pipeline run (06:00 PM IST)...');
      try {
        await fetchAndDedup({ runType: 'evening' });
        console.log('[Scheduler] ✓ Evening pipeline run finished successfully.');
      } catch (err) {
        console.error('[Scheduler] ✗ Evening pipeline run failed:', err.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('[Scheduler] Scheduled: Morning (08:00 IST) & Evening (18:00 IST) active.');
}

module.exports = { initScheduler };

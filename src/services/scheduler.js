const cron = require('node-cron');
const { fetchAndDedup } = require('../pipeline/fetchAndDedup');
const PipelineRun = require('../models/PipelineRun');
const { captureException, captureMessage } = require('./sentry');

/**
 * Watchdog helper: checks if expected runType completed successfully today.
 * Alerts Sentry if no record exists after scheduled grace period.
 *
 * @param {'morning'|'evening'} runType
 */
async function checkMissedRun(runType) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const run = await PipelineRun.findOne({
      runType,
      status: 'success',
      completedAt: { $gte: todayStart },
    }).lean();

    if (!run) {
      const msg = `[Scheduler Watchdog] Missed ${runType.toUpperCase()} pipeline run: No successful run recorded for today.`;
      console.error(msg);
      captureMessage(msg, 'error', {
        tags: {
          component: 'scheduler_watchdog',
          alertType: 'missed_scheduled_run',
          runType,
        },
      });
    } else {
      console.log(`[Scheduler Watchdog] ✓ Verified ${runType.toUpperCase()} run completed at ${run.completedAt.toISOString()}`);
    }
  } catch (err) {
    console.error(`[Scheduler Watchdog] Error checking ${runType} run status:`, err.message);
    captureException(err, { tags: { component: 'scheduler_watchdog' } });
  }
}

/**
 * Starts the in-process twice-daily pipeline scheduler and watchdog.
 *
 * Runs:
 * - 08:00 AM IST: Morning run (full rolling 24h window)
 * - 08:35 AM IST: Morning run watchdog (detects missed execution)
 * - 06:00 PM IST: Evening run (incremental since morning run)
 * - 06:35 PM IST: Evening run watchdog (detects missed execution)
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
        captureException(err, { tags: { component: 'scheduler', runType: 'morning' } });
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Morning Watchdog: 8:35 AM IST (35 min grace period)
  cron.schedule(
    '35 8 * * *',
    async () => {
      console.log('[Scheduler Watchdog] Checking morning run status (08:35 IST)...');
      await checkMissedRun('morning');
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
        captureException(err, { tags: { component: 'scheduler', runType: 'evening' } });
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Evening Watchdog: 6:35 PM IST (35 min grace period)
  cron.schedule(
    '35 18 * * *',
    async () => {
      console.log('[Scheduler Watchdog] Checking evening run status (18:35 IST)...');
      await checkMissedRun('evening');
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('[Scheduler] Scheduled: Morning (08:00 IST), Evening (18:00 IST), and Watchdog active.');
}

module.exports = { initScheduler, checkMissedRun };

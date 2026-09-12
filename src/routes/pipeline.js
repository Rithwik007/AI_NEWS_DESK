const express = require('express');
const router = express.Router();
const { fetchAndDedup } = require('../pipeline/fetchAndDedup');

/**
 * POST /api/pipeline/trigger
 * Triggers an immediate pipeline run (manual trigger for testing or external cron).
 *
 * Headers:
 * - x-pipeline-secret: matching process.env.PIPELINE_SECRET (if configured)
 *
 * Query / Body params:
 * - runType: 'morning' | 'evening' (default: 'morning')
 * - forceDeliverAll: boolean (optional)
 * - limit: number (optional)
 */
router.post('/trigger', async (req, res) => {
  try {
    const configuredSecret = process.env.PIPELINE_SECRET;
    if (configuredSecret) {
      const incomingSecret = req.headers['x-pipeline-secret'] || req.query.secret;
      if (incomingSecret !== configuredSecret) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid pipeline secret' });
      }
    }

    const runType = req.body.runType || req.query.runType || 'morning';
    const limit = req.body.limit ? Number(req.body.limit) : undefined;
    const forceDeliverAll = req.body.forceDeliverAll === true || req.query.forceDeliverAll === 'true';

    console.log(`[Pipeline API] Manual trigger received (runType: ${runType}, limit: ${limit || 'default'})...`);

    // Run asynchronously or await
    // Awaiting gives caller the run result
    const result = await fetchAndDedup({
      runType,
      limit,
      forceDeliverAll,
    });

    return res.json({
      success: true,
      message: 'Pipeline run completed successfully',
      result,
    });
  } catch (err) {
    console.error('[Pipeline API] Trigger failed:', err);
    return res.status(500).json({
      error: 'PipelineError',
      message: err.message,
    });
  }
});

module.exports = router;

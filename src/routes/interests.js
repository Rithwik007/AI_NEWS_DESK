const express = require('express');
const router = express.Router();
const InterestProfile = require('../models/InterestProfile');
const { requireClerkAuth } = require('../middleware/auth');
const { generateEmbedding } = require('../services/embeddings');

/**
 * GET /api/interests
 * Returns the authenticated user's own InterestProfile.
 * Returns empty/default state if profile does not exist yet.
 */
router.get('/', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const profile = await InterestProfile.findOne({ userId: clerkUserId }).lean();

    if (!profile) {
      return res.status(200).json({
        success: true,
        userId: clerkUserId,
        topics: [],
        updatedAt: null,
      });
    }

    return res.status(200).json({
      success: true,
      userId: profile.userId,
      topics: profile.topics.map((t) => ({
        topic: t.topic,
        weight: t.weight,
      })),
      updatedAt: profile.updatedAt,
    });
  } catch (err) {
    console.error(`[Interests API] Error in GET /api/interests: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: `Failed to fetch interest profile: ${err.message}`,
    });
  }
});

/**
 * POST /api/interests
 * Upserts the authenticated user's interest topics and weights.
 * Re-embeds only new or modified topic strings; reuses stored embeddings for unchanged text.
 */
router.post('/', requireClerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { topics } = req.body;

    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Request body must include a non-empty "topics" array',
      });
    }

    // Validate structure and ranges
    for (let i = 0; i < topics.length; i++) {
      const item = topics[i];
      if (!item || typeof item.topic !== 'string' || item.topic.trim().length === 0) {
        return res.status(400).json({
          error: 'ValidationError',
          message: `Topic at index ${i} must have a non-empty "topic" string`,
        });
      }
      const w = Number(item.weight);
      if (isNaN(w) || w < 0 || w > 1) {
        return res.status(400).json({
          error: 'ValidationError',
          message: `Topic "${item.topic}" weight must be a number between 0 and 1`,
        });
      }
    }

    // Fetch existing profile to detect unchanged topics
    const existingProfile = await InterestProfile.findOne({ userId: clerkUserId });
    const existingEmbeddingMap = new Map();

    if (existingProfile && Array.isArray(existingProfile.topics)) {
      for (const t of existingProfile.topics) {
        if (t.topic && Array.isArray(t.embedding) && t.embedding.length === 384) {
          existingEmbeddingMap.set(t.topic.trim(), t.embedding);
        }
      }
    }

    let reusedCount = 0;
    let newlyEmbeddedCount = 0;
    const processedTopics = [];

    for (const item of topics) {
      const topicText = item.topic.trim();
      const weight = Number(item.weight);

      let embedding = existingEmbeddingMap.get(topicText);

      if (embedding) {
        reusedCount++;
      } else {
        newlyEmbeddedCount++;
        embedding = await generateEmbedding(topicText);
      }

      processedTopics.push({
        topic: topicText,
        weight,
        embedding,
      });
    }

    console.log(
      `[Interests API] User ${clerkUserId}: ${processedTopics.length} topics processed (${reusedCount} reused embeddings, ${newlyEmbeddedCount} newly embedded)`
    );

    const updatedProfile = await InterestProfile.findOneAndUpdate(
      { userId: clerkUserId },
      {
        $set: {
          topics: processedTopics,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      userId: updatedProfile.userId,
      count: updatedProfile.topics.length,
      reusedEmbeddings: reusedCount,
      newEmbeddings: newlyEmbeddedCount,
      topics: updatedProfile.topics.map((t) => ({
        topic: t.topic,
        weight: t.weight,
      })),
      updatedAt: updatedProfile.updatedAt,
    });
  } catch (err) {
    console.error(`[Interests API] Error in POST /api/interests: ${err.message}`);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to save interest profile',
    });
  }
});

module.exports = router;

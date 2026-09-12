require('dotenv').config();
const mongoose = require('mongoose');
const Article = require('../models/Article');

async function unsetDeprecatedFields() {
  console.log('[Unset] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Unset] Connected.');

  const totalBefore = await Article.countDocuments({});
  console.log(`[Unset] Total Article documents: ${totalBefore}`);

  // Check how many documents currently have any of the deprecated fields
  const fieldsToCheck = [
    'bestRawSimilarity',
    'rankingScore',
    'relevanceScore',
    'matchedTopic',
    'isRelevant',
    'filteredReason',
    'confidenceTier',
    'deliveredAt',
    'deliveryStatus',
  ];

  const orConditions = fieldsToCheck.map((f) => ({ [f]: { $exists: true } }));
  const docsWithFields = await Article.countDocuments({ $or: orConditions });
  console.log(`[Unset] Documents containing at least one deprecated field: ${docsWithFields}`);

  const unsetObj = {};
  fieldsToCheck.forEach((f) => {
    unsetObj[f] = '';
  });

  console.log('[Unset] Running updateMany with $unset...');
  const result = await Article.collection.updateMany({}, { $unset: unsetObj });
  console.log(`[Unset] updateMany result: matched=${result.matchedCount}, modified=${result.modifiedCount}`);

  // Also drop obsolete index on isRelevant if it exists
  try {
    const indexes = await Article.collection.indexes();
    const isRelevantIndex = indexes.find((idx) => idx.key && idx.key.isRelevant);
    if (isRelevantIndex) {
      console.log(`[Unset] Dropping index "${isRelevantIndex.name}" on isRelevant...`);
      await Article.collection.dropIndex(isRelevantIndex.name);
      console.log('[Unset] Index dropped.');
    } else {
      console.log('[Unset] No isRelevant index found on Article collection.');
    }
  } catch (idxErr) {
    console.warn('[Unset] Warning checking/dropping index:', idxErr.message);
  }

  // Verification check: ensure 0 documents have any of the removed fields
  const docsRemaining = await Article.countDocuments({ $or: orConditions });
  console.log(`[Unset] Verification check: documents with deprecated fields remaining: ${docsRemaining}`);

  // Sample one document to inspect clean schema
  const sample = await Article.findOne({}).lean();
  console.log('\n[Unset] Clean Article document sample keys:');
  console.log(Object.keys(sample));

  await mongoose.disconnect();
  console.log('[Unset] Complete. DB disconnected.');
}

unsetDeprecatedFields().catch((err) => {
  console.error('[Unset] Error:', err);
  process.exit(1);
});

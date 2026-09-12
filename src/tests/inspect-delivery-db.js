const { connectDB, disconnectDB } = require('../db/connect');
const Article = require('../models/Article');

async function checkDeliveryStatus() {
  await connectDB();
  try {
    const total = await Article.countDocuments();
    const relevant = await Article.countDocuments({ isRelevant: true });
    const summarized = await Article.countDocuments({ isRelevant: true, summary: { $ne: null } });
    const delivered = await Article.countDocuments({ deliveryStatus: 'delivered' });
    const undelivered = await Article.countDocuments({
      isRelevant: true,
      summary: { $ne: null },
      deliveryStatus: { $ne: 'delivered' },
    });

    console.log('Total articles in DB:                 ', total);
    console.log('Total relevant articles:              ', relevant);
    console.log('Total summarized relevant articles:   ', summarized);
    console.log('Total marked delivered:               ', delivered);
    console.log('Total remaining undelivered:          ', undelivered);

    // Group delivered articles by fetchedAt date to see the two batches
    const deliveredArticles = await Article.find(
      { deliveryStatus: 'delivered' },
      { title: 1, fetchedAt: 1, deliveredAt: 1, confidenceTier: 1 }
    ).lean();

    const batch1 = deliveredArticles.filter(
      (a) => new Date(a.fetchedAt) < new Date('2026-09-08T00:00:00Z')
    );
    const batch2 = deliveredArticles.filter(
      (a) => new Date(a.fetchedAt) >= new Date('2026-09-08T00:00:00Z')
    );

    console.log('\n--- DELIVERED BATCH BREAKDOWN ---');
    console.log('Batch 1 (from 2026-09-06/07 Step 3 session):', batch1.length);
    console.log('Batch 2 (from 2026-09-08 fresh pipeline run):', batch2.length);
    console.log('Total delivered:', batch1.length + batch2.length);

    console.log('\nSample from Batch 1:');
    batch1.slice(0, 3).forEach((a) => console.log('  -', a.title.slice(0, 70)));

    console.log('\nSample from Batch 2:');
    batch2.slice(0, 3).forEach((a) => console.log('  -', a.title.slice(0, 70)));
  } finally {
    await disconnectDB();
  }
}

checkDeliveryStatus().catch(console.error);

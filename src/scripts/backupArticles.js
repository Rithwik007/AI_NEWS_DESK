require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Article = require('../models/Article');

async function backup() {
  console.log('[Backup] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Backup] Connected.');

  const backupDir = path.resolve(__dirname, '../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `articles-backup-${timestamp}.json`);

  console.log('[Backup] Fetching all Article documents...');
  const articles = await Article.find({}).lean();
  console.log(`[Backup] Found ${articles.length} articles.`);

  fs.writeFileSync(backupFile, JSON.stringify(articles, null, 2), 'utf-8');
  const stats = fs.statSync(backupFile);

  console.log(`[Backup] Successfully exported ${articles.length} articles to:`);
  console.log(`  File: ${backupFile}`);
  console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);

  await mongoose.disconnect();
  console.log('[Backup] DB disconnected. Backup complete.');
}

backup().catch((err) => {
  console.error('[Backup] Error:', err);
  process.exit(1);
});

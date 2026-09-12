const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * Cosine similarity between two vectors.
 *
 * Since our embeddings are L2-normalized (normalize: true in the pipeline),
 * cosine similarity simplifies to the dot product. But we compute it
 * explicitly here for clarity and correctness if normalization ever changes.
 *
 * Returns a value between -1 and 1:
 *   1.0 = identical direction (same story)
 *   0.0 = orthogonal (unrelated)
 *  -1.0 = opposite (never happens with sentence embeddings in practice)
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Union-Find (Disjoint Set Union) for efficient clustering.
 *
 * Why Union-Find instead of simple greedy grouping:
 * - Greedy: if A~B and B~C but A≁C, greedy might miss the transitive link
 * - Union-Find: correctly merges A, B, C into one cluster via transitivity
 *
 * Uses path compression + union by rank for near-O(1) operations.
 */
class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    // union by rank — attach smaller tree under larger
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
  }
}

/**
 * Cluster new articles by semantic similarity, comparing against both other
 * new articles (intra-batch) AND existing articles from recent DB runs
 * (cross-run dedup).
 *
 * Algorithm:
 * 1. Build combined array: [...existingArticles, ...newArticles]
 * 2. UnionFind over combined set
 * 3. Pairwise cosine similarity — but SKIP existing↔existing pairs
 *    (they're already clustered in DB). Only compare:
 *    - new↔existing (cross-run dedup)
 *    - new↔new (intra-batch dedup)
 * 4. Group by connected component
 * 5. For clusters containing existing articles → reuse existing clusterId
 *    For all-new clusters → generate new UUID
 * 6. Pick primary per cluster (all-new clusters only):
 *    earliest publishedAt, ties broken by longer snippet.
 *    isPrimary is LOCKED at cluster creation — never changed after.
 *    New articles merging into existing clusters are always non-primary.
 *    ("Best article" selection deferred to step 3 / summarize step.)
 *
 * @param {Array} newArticles - New articles with `embedding` field populated
 * @param {Array} existingArticles - Already-stored articles from DB (within recency window)
 * @param {number} threshold - Cosine similarity threshold (default from config)
 * @returns {Array} newArticles with clusterId and isPrimary set
 */
function clusterArticles(newArticles, existingArticles = [], threshold = config.SIMILARITY_THRESHOLD) {
  if (newArticles.length === 0) return newArticles;

  const existingCount = existingArticles.length;
  const combined = [...existingArticles, ...newArticles];
  const totalCount = combined.length;

  console.log(`[Dedup] Clustering ${newArticles.length} new articles against ${existingCount} existing (threshold: ${threshold})...`);

  const uf = new UnionFind(totalCount);
  let pairsCompared = 0;
  let pairsMerged = 0;

  // Pairwise comparison over combined set
  // Skip existing↔existing pairs (indices 0..existingCount-1)
  // Only compare: new↔existing and new↔new
  for (let i = 0; i < totalCount; i++) {
    // If i is an existing article, only compare against new articles (skip existing↔existing)
    const jStart = i < existingCount ? existingCount : i + 1;
    for (let j = jStart; j < totalCount; j++) {
      const similarity = cosineSimilarity(combined[i].embedding, combined[j].embedding);
      pairsCompared++;

      if (similarity >= threshold) {
        uf.union(i, j);
        pairsMerged++;
      }
    }
  }

  // Group by cluster root
  const clusters = new Map(); // rootIndex -> [indices into combined]
  for (let i = 0; i < totalCount; i++) {
    const root = uf.find(i);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root).push(i);
  }

  // Stats tracking
  let newClustersFormed = 0;
  let mergedIntoExisting = 0;
  let totalDuplicates = 0;

  for (const [, indices] of clusters) {
    // Split indices into existing vs new
    const existingIndices = indices.filter((i) => i < existingCount);
    const newIndices = indices.filter((i) => i >= existingCount);

    // Skip clusters with no new articles (pure existing — nothing to do)
    if (newIndices.length === 0) continue;

    const hasExisting = existingIndices.length > 0;

    // Determine clusterId: reuse from existing article if present, else new UUID
    let clusterId;
    if (hasExisting) {
      // Reuse existing clusterId — all existing articles in this component
      // share one (they were already clustered in a prior run)
      clusterId = combined[existingIndices[0]].clusterId;
      mergedIntoExisting += newIndices.length;
    } else {
      clusterId = uuidv4();
      newClustersFormed++;
    }

    if (hasExisting) {
      // Merging into existing cluster — all new articles are non-primary.
      // isPrimary is locked at cluster creation, never changed after.
      // "Best article" selection deferred to step 3 (summarize).
      for (const idx of newIndices) {
        combined[idx].clusterId = clusterId;
        combined[idx].isPrimary = false;
      }
      totalDuplicates += newIndices.length;
    } else {
      // All-new cluster — pick primary: earliest publishedAt, longest snippet on tie
      const sorted = [...newIndices].sort((a, b) => {
        const timeA = new Date(combined[a].publishedAt).getTime();
        const timeB = new Date(combined[b].publishedAt).getTime();
        if (timeA !== timeB) return timeA - timeB; // earliest first

        const snippetLenA = (combined[a].snippet || '').length;
        const snippetLenB = (combined[b].snippet || '').length;
        return snippetLenB - snippetLenA; // longer first
      });

      const primaryIdx = sorted[0];
      for (const idx of newIndices) {
        combined[idx].clusterId = clusterId;
        combined[idx].isPrimary = idx === primaryIdx;
      }
      totalDuplicates += newIndices.length - 1; // all non-primary are dupes
    }
  }

  console.log(`[Dedup] ✓ ${newClustersFormed} new clusters formed`);
  console.log(`[Dedup]   ${mergedIntoExisting} new articles merged into existing clusters from previous runs`);
  console.log(`[Dedup]   ${pairsCompared} pairs compared, ${pairsMerged} pairs above threshold`);
  console.log(`[Dedup]   ${totalDuplicates} new articles marked as duplicates`);

  return newArticles;
}

module.exports = { cosineSimilarity, clusterArticles };

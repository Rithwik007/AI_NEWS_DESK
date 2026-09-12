const config = require('../config');

/**
 * Embedding service using transformers.js (@huggingface/transformers).
 *
 * Uses a singleton pattern for the pipeline — the model (~23MB ONNX) is
 * loaded once on first call and reused for all subsequent embeddings in
 * the same process. This avoids reloading per-article.
 *
 * Model: Xenova/all-MiniLM-L6-v2
 * - 384-dimensional output vectors
 * - Optimized for semantic similarity tasks
 * - Small enough for serverless (with caveats — see PROJECT_CONTEXT.md)
 */

let extractorPipeline = null;

/**
 * Lazy-load the feature-extraction pipeline.
 * Uses dynamic import() because @huggingface/transformers is ESM-only.
 */
async function getExtractor() {
  if (extractorPipeline) return extractorPipeline;

  console.log(`[Embedding] Loading model: ${config.EMBEDDING_MODEL} (first run downloads ~23MB)...`);

  // Dynamic import — @huggingface/transformers is ESM
  const { pipeline } = await import('@huggingface/transformers');

  extractorPipeline = await pipeline('feature-extraction', config.EMBEDDING_MODEL, {
    // Quantized model for faster loading + smaller footprint
    dtype: 'q8',
  });

  console.log('[Embedding] Model loaded successfully');
  return extractorPipeline;
}

/**
 * Generate a single embedding vector from text.
 * Concatenation of title + snippet is the expected input.
 *
 * Returns a plain JS array of floats (384 dimensions).
 */
async function generateEmbedding(text) {
  const extractor = await getExtractor();

  // pooling: 'mean' — averages all token vectors into one sentence vector
  // normalize: true — L2-normalizes so cosine similarity = dot product
  const output = await extractor(text, { pooling: 'mean', normalize: true });

  // Convert from Tensor to plain array for MongoDB storage
  return Array.from(output.data);
}

/**
 * Generate embeddings for a batch of articles.
 * Concatenates title + snippet for each article as the embedding input.
 *
 * Mutates articles in-place by adding the `embedding` field.
 * Returns the same array for chaining convenience.
 */
async function generateEmbeddings(articles) {
  console.log(`[Embedding] Generating embeddings for ${articles.length} articles...`);

  // Ensure model is loaded before starting (so load time isn't counted per-article)
  await getExtractor();

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const text = `${article.title} ${article.snippet}`.trim();
    article.embedding = await generateEmbedding(text);

    // Progress logging every 10 articles (avoid spam on large batches)
    if ((i + 1) % 10 === 0 || i === articles.length - 1) {
      console.log(`[Embedding] Progress: ${i + 1}/${articles.length}`);
    }
  }

  console.log(`[Embedding] ✓ All ${articles.length} embeddings generated`);
  return articles;
}

module.exports = { generateEmbedding, generateEmbeddings };

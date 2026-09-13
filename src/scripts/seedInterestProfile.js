/**
 * One-time seed script for the default user's interest profile.
 *
 * Embeds each topic using all-MiniLM-L6-v2 via transformers.js
 * (the exact same model used for article embeddings).
 *
 * Upserts the document for userId "default-user".
 * Run manually whenever topic definitions or weights change:
 * node src/scripts/seedInterestProfile.js
 */
const { connectDB, disconnectDB } = require('../db/connect');
const { generateEmbedding } = require('../services/embeddings');
const InterestProfile = require('../models/InterestProfile');

const STARTER_TOPICS = [
  {
    topic: 'new large language model releases, LLM checkpoints, model weights, open-weights, architecture benchmarks, and frontier model launches like GPT, Claude, Gemini, Llama, Mistral, DeepSeek, and Qwen',
    weight: 1.0,
  },
  {
    topic: 'agentic AI systems, multi-agent coordination, autonomous agent workflows, reasoning loops, planning algorithms, tool calling, and computer use research',
    weight: 1.0,
  },
  {
    topic: 'AI developer coding agents and automated assistant software including Cursor, Devin, Claude Code, Copilot, Cline, Windsurf, Aider, and SWE-bench tools',
    weight: 1.0,
  },
  {
    topic: 'AI developer infrastructure, serving frameworks, inference optimization, vector search, vLLM, Ollama, LangChain, LlamaIndex, GPU clusters, and CUDA kernels',
    weight: 0.9,
  },
  {
    topic: 'peer-reviewed AI scientific research breakthroughs, novel neural network architectures, attention mechanisms, post-training RLHF, and arXiv machine learning papers',
    weight: 0.8,
  },
  {
    topic: 'generative AI software applications, text-to-image models, video generation, audio synthesis tools like Midjourney, Flux, Kling, Runway, ElevenLabs, and Sora',
    weight: 0.7,
  },
  {
    topic: 'venture capital funding rounds, seed investments, valuations, corporate acquisitions, and leadership executive changes at AI startups and labs like OpenAI, Anthropic, Scale, and xAI',
    weight: 0.6,
  },
  {
    topic: 'government legislation, international AI governance and human rights policy, copyright infringement lawsuits, training data fair use court cases, national security export controls, and safety governance like EU AI Act and California SB 1047',
    weight: 0.4,
  },
  {
    topic: 'consumer hardware devices, smartphones, PCs, laptops, wearable gadgets, voice assistants, and operating system features equipped with embedded on-device AI',
    weight: 0.3,
  },
];

async function seed() {
  console.log('[Seed] Connecting to database...');
  await connectDB();

  try {
    console.log(`[Seed] Generating embeddings for ${STARTER_TOPICS.length} starter topics...`);
    const embeddedTopics = [];

    for (let i = 0; i < STARTER_TOPICS.length; i++) {
      const item = STARTER_TOPICS[i];
      console.log(`[Seed] Embedding topic (${i + 1}/${STARTER_TOPICS.length}): "${item.topic}" (weight: ${item.weight})`);
      const embedding = await generateEmbedding(item.topic);
      embeddedTopics.push({
        topic: item.topic,
        weight: item.weight,
        embedding,
      });
    }

    console.log('[Seed] Saving interest profile for "default-user"...');
    const profile = await InterestProfile.findOneAndUpdate(
      { userId: 'default-user' },
      {
        userId: 'default-user',
        topics: embeddedTopics,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`[Seed] ✓ Successfully saved interest profile! Total topics: ${profile.topics.length}`);
  } finally {
    await disconnectDB();
  }
}

seed().catch((error) => {
  console.error('[Seed] Failed:', error);
  process.exit(1);
});

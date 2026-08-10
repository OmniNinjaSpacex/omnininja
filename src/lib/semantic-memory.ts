import { db } from './db';
import { embedText } from './openai-services';

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseEmbedding(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

export async function buildSemanticMemoryContext(userId: string, query: string) {
  const queryEmbedding = await embedText(query).catch(() => [] as number[]);
  if (!queryEmbedding.length) return { queryEmbedding: [], context: '' };

  const rows = await db.message.findMany({
    where: {
      userId,
      role: 'user',
      embeddingJson: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 180,
    select: {
      content: true,
      embeddingJson: true,
      createdAt: true,
    },
  });

  const ranked = rows
    .map((row) => ({
      content: row.content,
      createdAt: row.createdAt,
      score: cosineSimilarity(queryEmbedding, parseEmbedding(row.embeddingJson)),
    }))
    .filter((row) => row.score >= 0.32 && row.content.trim() && row.content.trim() !== query.trim())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const context = ranked.length
    ? ranked
        .map((row, index) => `${index + 1}. [${row.createdAt.toISOString().slice(0, 10)}] ${row.content.slice(0, 900)}`)
        .join('\n')
    : '';

  return { queryEmbedding, context };
}

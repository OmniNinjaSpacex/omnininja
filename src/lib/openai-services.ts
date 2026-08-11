const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function requireOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY não configurada no servidor');
  return key;
}

export const OPENAI_SERVICE_MODELS = {
  chat: process.env.OMNININJA_MODEL || 'gpt-5.6',
  moderation: 'omni-moderation-latest',
  transcription: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
  speech: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  realtime: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
  video: process.env.OPENAI_VIDEO_MODEL || 'sora-2',
  embedding: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
} as const;

export type OpenAIExecutionMode = 'chat' | 'work' | 'codex';

export function buildOpenAIHostedTools(mode: OpenAIExecutionMode = 'chat'): any[] {
  // OpenAI rejects code_interpreter and hosted shell when both request an
  // OpenAI-managed container. Keep the capabilities available across the
  // product while selecting exactly one container execution tool per request.
  const executionTool = mode === 'chat'
    ? { type: 'code_interpreter', container: { type: 'auto' } }
    : { type: 'shell', environment: { type: 'container_auto' } };
  const tools: any[] = [
    { type: 'web_search' },
    executionTool,
  ];

  const vectorStoreIds = Array.from(new Set(
    (process.env.OPENAI_VECTOR_STORE_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )).slice(0, 8);

  if (vectorStoreIds.length > 0) {
    tools.push({ type: 'file_search', vector_store_ids: vectorStoreIds, max_num_results: 12 });
  }

  return tools;
}

export async function moderateText(text: string): Promise<{ flagged: boolean; categories: string[] }> {
  const input = text.trim();
  if (!input) return { flagged: false, categories: [] };

  const response = await fetch(`${OPENAI_BASE_URL}/moderations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${requireOpenAIKey()}`,
    },
    body: JSON.stringify({ model: OPENAI_SERVICE_MODELS.moderation, input }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) return { flagged: false, categories: [] };

  const payload = await response.json().catch(() => ({} as any));
  const result = payload?.results?.[0];
  const categories = Object.entries(result?.categories || {})
    .filter(([, flagged]) => Boolean(flagged))
    .map(([name]) => name);

  return { flagged: Boolean(result?.flagged), categories };
}

export async function embedText(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) return [];

  const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${requireOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: OPENAI_SERVICE_MODELS.embedding,
      input: input.slice(0, 12000),
      encoding_format: 'float',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({} as any));
  const vector = payload?.data?.[0]?.embedding;
  return Array.isArray(vector) ? vector.map(Number).filter(Number.isFinite) : [];
}

export { OPENAI_BASE_URL };

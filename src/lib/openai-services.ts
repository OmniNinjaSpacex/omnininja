const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

export function requireOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY não configurada no servidor');
  return key;
}

export function buildOpenAIHostedTools(): any[] {
  const tools: any[] = [
    { type: 'web_search' },
    {
      type: 'code_interpreter',
      container: { type: 'auto' },
    },
    {
      type: 'image_generation',
      action: 'auto',
      quality: 'auto',
      size: 'auto',
      background: 'auto',
    },
  ];

  const vectorStoreIds = (process.env.OPENAI_VECTOR_STORE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (vectorStoreIds.length > 0) {
    tools.push({
      type: 'file_search',
      vector_store_ids: vectorStoreIds,
      max_num_results: 12,
    });
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
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // Moderation is defense-in-depth. A temporary moderation outage must not
    // silently disable the model's own safety behavior or leak implementation.
    return { flagged: false, categories: [] };
  }

  const payload = await response.json().catch(() => ({} as any));
  const result = payload?.results?.[0];
  const categories = Object.entries(result?.categories || {})
    .filter(([, flagged]) => Boolean(flagged))
    .map(([name]) => name);

  return {
    flagged: Boolean(result?.flagged),
    categories,
  };
}

export const OPENAI_SERVICE_MODELS = {
  chat: process.env.OMNINJA_MODEL || 'gpt-5.6',
  moderation: 'omni-moderation-latest',
  transcription: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
  speech: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  realtime: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
  image: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  video: process.env.OPENAI_VIDEO_MODEL || 'sora-2',
  embedding: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
} as const;

export { OPENAI_BASE_URL };

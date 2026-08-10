// OmniNinja — Native OpenAI Responses API chat client
// Server-side only. Never expose OPENAI_API_KEY to the browser.

export interface OpenAIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenAIChatResult {
  content: string;
  model: string;
}

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY nao configurada no servidor');
  return key;
}

export function hasNativeOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function modelName(): string {
  return process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_AGENT_MODEL || 'gpt-5.2';
}

function extractText(payload: any): string {
  const parts: string[] = [];
  for (const item of payload?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

export async function openAIChat(
  messages: OpenAIChatMessage[],
  instructions: string,
  maxOutputTokens = 1024,
): Promise<OpenAIChatResult> {
  const model = modelName();
  const response = await fetch(RESPONSES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input: messages,
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const content = extractText(payload);
  if (!content) throw new Error('OpenAI retornou uma resposta vazia');
  return { content, model };
}

export async function openAIChatStream(
  messages: OpenAIChatMessage[],
  instructions: string,
  onDelta: (delta: string) => void,
  maxOutputTokens = 1024,
): Promise<OpenAIChatResult> {
  const model = modelName();
  const response = await fetch(RESPONSES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input: messages,
      max_output_tokens: maxOutputTokens,
      stream: true,
      store: false,
    }),
    cache: 'no-store',
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({} as any));
    throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const event = JSON.parse(raw);
        if (event?.type === 'response.output_text.delta' && typeof event?.delta === 'string') {
          full += event.delta;
          onDelta(event.delta);
        }
        if (event?.type === 'error') {
          throw new Error(event?.error?.message || 'OpenAI streaming error');
        }
      } catch (error: any) {
        if (String(error?.message || '').includes('OpenAI streaming error')) throw error;
        // Ignore incomplete/non-JSON SSE lines.
      }
    }
  }

  if (!full) throw new Error('OpenAI retornou uma resposta vazia');
  return { content: full, model };
}

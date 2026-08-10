// OmniNinja — OpenAI native client (Responses API)
// Server-only. Never expose OPENAI_API_KEY to the browser.
// This module intentionally keeps the old openrouter.ts public interface so
// the rest of the app can migrate without a large refactor.

export type OpenRouterModel = string; // compatibility alias used by existing code

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  model?: OpenRouterModel;
  temperature?: number;
  maxTokens?: number;
  fallback?: boolean;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: OpenRouterModel;
}

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

// Keep the model configurable because API access can differ by project/account.
// `gpt-5` is the default used by OpenAI's current quickstart; override it with
// OPENAI_MODEL without changing code.
export const DEFAULT_MODEL: OpenRouterModel = process.env.OPENAI_MODEL || 'gpt-5';

// Compatibility export for older UI/admin code that imports this symbol.
export const OPENROUTER_MODELS = {
  chatgpt: {
    openrouterModel: DEFAULT_MODEL,
    apiKeyEnv: 'OPENAI_API_KEY',
    label: 'OpenAI',
    description: 'Cérebro central do OmniNinja via Responses API.',
    accent: '#10a37f',
    backend: 'openai',
  },
} as const;

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada no servidor');
  return key;
}

function resolveModel(requested?: string): string {
  // The current frontend sends provider aliases such as "chatgpt" or "glm".
  // OpenAI is now the orchestrator for all of them; only an actual OpenAI model
  // id is accepted as an override. Otherwise the server-side env wins.
  if (requested && /^(gpt-|o\d|computer-use|codex-)/i.test(requested)) return requested;
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

function buildResponseBody(opts: CompletionOptions, stream = false) {
  const system = opts.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const input = opts.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: resolveModel(opts.model),
    input,
    stream,
  };

  if (system) body.instructions = system;
  if (opts.maxTokens) body.max_output_tokens = opts.maxTokens;

  // Some reasoning models do not accept temperature. Keep it opt-in so one
  // model switch cannot break the whole agent.
  if (process.env.OPENAI_ENABLE_TEMPERATURE === 'true' && typeof opts.temperature === 'number') {
    body.temperature = opts.temperature;
  }

  return body;
}

function extractOutputText(data: any): string {
  if (!data) return '';
  if (typeof data.output_text === 'string') return data.output_text;

  const chunks: string[] = [];
  for (const item of data.output || []) {
    for (const part of item?.content || []) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part?.text === 'string') {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('');
}

async function openAIRequest(opts: CompletionOptions): Promise<any> {
  const apiKey = requireApiKey();
  const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'X-Client-Request-Id': `omnininja-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify(buildResponseBody(opts, false)),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${detail.slice(0, 500)}`);
  }
  return res.json();
}

export async function completion(opts: CompletionOptions): Promise<CompletionResult> {
  const data = await openAIRequest(opts);
  const content = extractOutputText(data);
  if (!content) throw new Error('OpenAI retornou uma resposta vazia');

  return {
    content,
    model: data?.model || resolveModel(opts.model),
    provider: 'chatgpt',
  };
}

export async function completionStream(
  opts: CompletionOptions,
  onDelta: (delta: string) => void,
): Promise<CompletionResult> {
  const apiKey = requireApiKey();
  const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      accept: 'text/event-stream',
      'X-Client-Request-Id': `omnininja-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify(buildResponseBody(opts, true)),
    cache: 'no-store',
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI stream HTTP ${res.status}: ${detail.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let completedResponse: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let event: any;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        full += event.delta;
        onDelta(event.delta);
      } else if (event?.type === 'response.completed') {
        completedResponse = event.response;
      } else if (event?.type === 'error') {
        throw new Error(event?.message || event?.error?.message || 'OpenAI streaming error');
      }
    }
  }

  if (!full && completedResponse) {
    full = extractOutputText(completedResponse);
    if (full) onDelta(full);
  }

  if (!full) throw new Error('OpenAI stream retornou uma resposta vazia');

  return {
    content: full,
    model: completedResponse?.model || resolveModel(opts.model),
    provider: 'chatgpt',
  };
}

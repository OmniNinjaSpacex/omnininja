// OmniNinja — Cliente LLM multi-modelo (substitui z-ai-web-dev-sdk)
// Suporta OpenRouter (Claude, GPT, Kimi, Grok) e Google AI Studio nativo (Gemini).
// Fallback automático: se um provedor falhar, tenta o próximo que tiver chave.

export type OpenRouterModel =
  | 'claude' | 'chatgpt' | 'kimi' | 'grok' | 'gemini';

// Mapa: id do provedor (frontend) -> modelo real + qual chave usar.
export const OPENROUTER_MODELS: Record<OpenRouterModel, {
  openrouterModel: string;
  apiKeyEnv: string;
  label: string;
  description: string;
  accent: string;
  // 'openrouter' = via OpenRouter API; 'google' = via Google AI Studio API direto
  backend: 'openrouter' | 'google';
}> = {
  claude: {
    openrouterModel: 'anthropic/claude-sonnet-4',
    apiKeyEnv: 'OPENROUTER_CLAUDE_API_KEY',
    label: 'Claude (Anthropic)',
    description: 'Raciocínio profundo, codificação e loops longos (50+ passos).',
    accent: '#d97757',
    backend: 'openrouter',
  },
  chatgpt: {
    openrouterModel: 'openai/gpt-4o',
    apiKeyEnv: 'OPENROUTER_CHATGPT_API_KEY',
    label: 'ChatGPT (OpenAI)',
    description: 'Versátil, rápido, bom em tarefas gerais.',
    accent: '#10a37f',
    backend: 'openrouter',
  },
  kimi: {
    openrouterModel: 'moonshotai/kimi-k2',
    apiKeyEnv: 'OPENROUTER_KIMI_API_KEY',
    label: 'Kimi (Moonshot)',
    description: 'Janela de contexto enorme, bom em documentos longos.',
    accent: '#6366f1',
    backend: 'openrouter',
  },
  grok: {
    openrouterModel: 'x-ai/grok-4.3',
    apiKeyEnv: 'OPENROUTER_GROK_API_KEY',
    label: 'Grok (xAI)',
    description: 'Respostas diretas, melhor em tool-calling agentic.',
    accent: '#e4e4e7',
    backend: 'openrouter',
  },
  gemini: {
    openrouterModel: 'google/gemini-2.5-pro',
    apiKeyEnv: 'OPENROUTER_GEMINI_API_KEY',
    label: 'Gemini (Google)',
    description: 'Multimodal, rápido, boa relação custo-benefício.',
    accent: '#4285f4',
    backend: 'google', // usa Google AI Studio direto se a chave for do Google
  },
};

// Modelo padrão (orquestrador + chat). Pode ser sobrescrito por .env.
export const DEFAULT_MODEL: OpenRouterModel =
  (process.env.OMNININJA_DEFAULT_MODEL as OpenRouterModel) || 'claude';

function getKey(model: OpenRouterModel): string | undefined {
  const cfg = OPENROUTER_MODELS[model];
  return process.env[cfg.apiKeyEnv] || process.env.OPENROUTER_API_KEY;
}

// Detecta se a chave é do Google AI Studio (começa com AIza ou AQ.)
function isGoogleKey(key: string): boolean {
  return key.startsWith('AIza') || key.startsWith('AQ.');
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  model?: OpenRouterModel;
  temperature?: number;
  maxTokens?: number;
  // Se true, tenta o próximo provedor se o principal falhar.
  fallback?: boolean;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: OpenRouterModel;
}

const OR_BASE = 'https://openrouter.ai/api/v1/chat/completions';

// ---- Google AI Studio (Gemini nativo) ----
const GOOGLE_MODEL = 'gemini-flash-latest';
const GOOGLE_BASE = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}`;

// Converte mensagens no formato OpenAI para o formato Google Gemini
function toGoogleContents(messages: ChatMessage[]) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  return { systemInstruction: systemMsg?.content, contents };
}

async function callGoogleOnce(
  model: OpenRouterModel,
  messages: ChatMessage[],
  opts: CompletionOptions
): Promise<CompletionResult> {
  const apiKey = getKey(model);
  if (!apiKey) throw new Error(`Sem chave para ${model}`);
  const { systemInstruction, contents } = toGoogleContents(messages);
  const body: any = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 800,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  const url = `${GOOGLE_BASE(GOOGLE_MODEL)}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google ${model} HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text)
    .join('') ?? '';
  if (!content) throw new Error(`Google ${model}: resposta vazia`);
  return { content, model: GOOGLE_MODEL, provider: model };
}

async function callGoogleStream(
  model: OpenRouterModel,
  messages: ChatMessage[],
  opts: CompletionOptions,
  onDelta: (delta: string) => void
): Promise<CompletionResult> {
  const apiKey = getKey(model);
  if (!apiKey) throw new Error(`Sem chave para ${model}`);
  const { systemInstruction, contents } = toGoogleContents(messages);
  const body: any = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 800,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  const url = `${GOOGLE_BASE(GOOGLE_MODEL)}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google ${model} HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        const delta = obj?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text)
          .join('') ?? '';
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // chunk parcial, ignora
      }
    }
  }
  if (!full) throw new Error(`Google ${model}: resposta vazia`);
  return { content: full, model: GOOGLE_MODEL, provider: model };
}

// ---- OpenRouter ----
async function callOnce(
  model: OpenRouterModel,
  messages: ChatMessage[],
  opts: CompletionOptions
): Promise<CompletionResult> {
  const cfg = OPENROUTER_MODELS[model];
  const apiKey = getKey(model);
  if (!apiKey) {
    throw new Error(`Sem chave configurada para ${model} (${cfg.apiKeyEnv})`);
  }

  // Se for Gemini com chave do Google, usa a API nativa do Google
  if (cfg.backend === 'google' && isGoogleKey(apiKey)) {
    return callGoogleOnce(model, messages, opts);
  }

  const body: any = {
    model: cfg.openrouterModel,
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const res = await fetch(OR_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://omnininja.app',
      'X-Title': 'OmniNinja',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // 402 = sem créditos no OpenRouter. Sempre sinaliza para tentar menos tokens.
    if (res.status === 402) {
      throw new Error(`OPENROUTER_NO_CREDITS: ${errText.slice(0, 200)}`);
    }
    throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new Error(`OpenRouter ${model}: resposta vazia`);
  }
  return { content, model: cfg.openrouterModel, provider: model };
}

/**
 * Ordem de fallback: começa pelo modelo pedido, depois tenta os outros na
 * ordem em que aparecem no mapa (qualquer chave configurada serve).
 */
function fallbackChain(primary: OpenRouterModel): OpenRouterModel[] {
  const all = Object.keys(OPENROUTER_MODELS) as OpenRouterModel[];
  const configured = all.filter((m) => !!getKey(m));
  const rest = configured.filter((m) => m !== primary);
  return [primary, ...rest].filter((m) => !!getKey(m));
}

export async function completion(opts: CompletionOptions): Promise<CompletionResult> {
  const primary = opts.model || DEFAULT_MODEL;
  const chain = opts.fallback === false ? [primary] : fallbackChain(primary);
  let lastErr: Error | null = null;
  // Estratégia anti-402: se falhar, tenta de novo com max_tokens cada vez menor.
  const maxTokensAttempts = Array.from(
    new Set([opts.maxTokens, 800, 256].filter((v): v is number => typeof v === 'number'))
  );
  if (maxTokensAttempts.length === 0) maxTokensAttempts.push(undefined as any);
  for (const mt of maxTokensAttempts) {
    for (const m of chain) {
      try {
        return await callOnce(m, opts.messages, { ...opts, maxTokens: mt });
      } catch (err: any) {
        lastErr = err;
        if (String(err.message).includes('OPENROUTER_NO_CREDITS')) {
          console.error(`[openrouter] ${m} sem créditos — tentando próximo provedor / menos tokens...`);
          continue;
        }
        console.error(`[openrouter] ${m} falhou: ${err.message} — tentando próximo provedor...`);
      }
    }
  }
  throw lastErr || new Error('Nenhum provedor disponível');
}

/**
 * Versão streaming (token-a-token) via SSE.
 * onDelta é chamado com cada chunk de texto. Retorna o texto completo.
 */
export async function completionStream(
  opts: CompletionOptions,
  onDelta: (delta: string) => void
): Promise<CompletionResult> {
  const primary = opts.model || DEFAULT_MODEL;
  const chain = opts.fallback === false ? [primary] : fallbackChain(primary);
  let lastErr: Error | null = null;
  const maxTokensAttempts = Array.from(
    new Set([opts.maxTokens, 800, 256].filter((v): v is number => typeof v === 'number'))
  );
  if (maxTokensAttempts.length === 0) maxTokensAttempts.push(undefined as any);

  for (const mt of maxTokensAttempts) {
    for (const m of chain) {
      const cfg = OPENROUTER_MODELS[m];
      const apiKey = getKey(m);
      if (!apiKey) continue;
      try {
        // Google Gemini nativo (streaming)
        if (cfg.backend === 'google' && isGoogleKey(apiKey)) {
          return await callGoogleStream(m, opts.messages, { ...opts, maxTokens: mt }, onDelta);
        }

        // OpenRouter streaming
        const body: any = {
          model: cfg.openrouterModel,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          stream: true,
        };
        if (mt) body.max_tokens = mt;

        const res = await fetch(OR_BASE, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://omnininja.app',
            'X-Title': 'OmniNinja',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => '');
          if (res.status === 402) {
            throw new Error(`OPENROUTER_NO_CREDITS: ${errText.slice(0, 200)}`);
          }
          throw new Error(`OpenRouter ${m} HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;
            try {
              const obj = JSON.parse(payload);
              const delta = obj?.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                full += delta;
                onDelta(delta);
              }
            } catch {
              // chunk parcial, ignora
            }
          }
        }
        if (!full) throw new Error(`OpenRouter ${m}: resposta vazia`);
        return { content: full, model: cfg.openrouterModel, provider: m };
      } catch (err: any) {
        lastErr = err;
        if (String(err.message).includes('OPENROUTER_NO_CREDITS')) {
          console.error(`[openrouter-stream] ${m} sem créditos — tentando próximo provedor / menos tokens...`);
          continue;
        }
        console.error(`[openrouter-stream] ${m} falhou: ${err.message}`);
      }
    }
  }
  throw lastErr || new Error('Nenhum provedor disponível (stream)');
}

/** Lista os provedores que têm chave configurada (para o seletor do frontend). */
export function configuredProviders(): { id: OpenRouterModel; label: string; description: string; accent: string }[] {
  return (Object.keys(OPENROUTER_MODELS) as OpenRouterModel[])
    .filter((m) => !!getKey(m))
    .map((m) => {
      const cfg = OPENROUTER_MODELS[m];
      return { id: m, label: cfg.label, description: cfg.description, accent: cfg.accent };
    });
}

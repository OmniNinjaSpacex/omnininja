// OmniNinja — Chat endpoint (SSE streaming)
// Prefers native OpenAI Responses API when OPENAI_API_KEY is configured.
// OpenRouter/Google remain available as optional fallback providers.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { completionStream, type OpenRouterModel, type ChatMessage } from '@/lib/openrouter';
import { hasNativeOpenAI, openAIChat, openAIChatStream, type OpenAIChatMessage } from '@/lib/openai-chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CHAT_MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `Você é o OmniNinja, um agente de IA geral com modo Chat e modos Agent/Agent MAX.

Características:
- Responda em português do Brasil, salvo se o usuário pedir outro idioma.
- Use Markdown quando ajudar na clareza.
- No modo Chat, responda diretamente.
- Quando uma tarefa exigir browser, terminal, arquivos, execução de código ou criação de artefatos, explique que o modo Agent pode executar essas ações de verdade.
- Nunca revele chaves de API, tokens, cookies, variáveis de ambiente ou outros segredos do servidor.
- Seja conciso em perguntas simples e completo em tarefas complexas.`;

function shouldUseNativeOpenAI(requestedModel?: string): boolean {
  if (!hasNativeOpenAI()) return false;
  const provider = (process.env.OMNININJA_LLM_PROVIDER || '').toLowerCase();
  if (provider === 'openai') return true;
  if (!requestedModel) return true;
  const normalized = requestedModel.toLowerCase();
  return normalized === 'chatgpt' || normalized === 'openai' || normalized.startsWith('gpt-');
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const requestedModel = typeof body.model === 'string' ? body.model : undefined;
  const legacyModel = requestedModel as OpenRouterModel | undefined;
  const lastUser = [...incoming].reverse().find((m: any) => m.role === 'user');

  if (!lastUser) {
    return new Response(JSON.stringify({ error: 'messages required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const consume = await consumeCredits(user.id, CREDIT_COSTS.chat_message, 'chat_message');
  if (!consume.ok && consume.remaining === 0) {
    return new Response(JSON.stringify({ error: 'Créditos insuficientes' }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    });
  }

  await db.message.create({
    data: { userId: user.id, role: 'user', content: lastUser.content },
  });

  const recent = incoming
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content || '') }));

  const nativeOpenAI = shouldUseNativeOpenAI(requestedModel);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let fullText = '';
      let usedModel = '';

      try {
        send({
          type: 'start',
          credits: consume.remaining,
          engine: nativeOpenAI ? 'openai-responses' : 'legacy-provider',
        });

        if (nativeOpenAI) {
          const result = await openAIChatStream(
            recent as OpenAIChatMessage[],
            SYSTEM_PROMPT,
            (delta) => {
              fullText += delta;
              send({ type: 'delta', text: delta });
            },
            CHAT_MAX_TOKENS,
          );
          usedModel = result.model;
        } else {
          const messages: ChatMessage[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...recent,
          ];
          const result = await completionStream(
            { messages, model: legacyModel, temperature: 0.7, maxTokens: CHAT_MAX_TOKENS, fallback: true },
            (delta) => {
              fullText += delta;
              send({ type: 'delta', text: delta });
            },
          );
          usedModel = result.model;
        }

        if (!fullText) send({ type: 'error', error: 'Resposta vazia do modelo' });

        await db.message.create({
          data: { userId: user.id, role: 'assistant', content: fullText, model: usedModel },
        });
        send({ type: 'done', credits: Math.max(0, consume.remaining - 1), model: usedModel });
      } catch (err: any) {
        send({ type: 'error', error: err?.message || 'LLM error' });
      } finally {
        controller.enqueue(encoder.encode('event: end\ndata: {}\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  if (!q) return Response.json({ error: 'q required' }, { status: 400 });

  try {
    if (shouldUseNativeOpenAI(undefined)) {
      const result = await openAIChat(
        [{ role: 'user', content: q }],
        'Responda em português do Brasil, em até 2 frases.',
        256,
      );
      return Response.json({ text: result.content, model: result.model });
    }

    const { completion } = await import('@/lib/openrouter');
    const result = await completion({
      messages: [
        { role: 'system', content: 'Responda em português do Brasil, em até 2 frases.' },
        { role: 'user', content: q },
      ],
      fallback: true,
    });
    return Response.json({ text: result.content, model: result.model });
  } catch (err: any) {
    return Response.json({ error: err?.message || 'LLM error' }, { status: 500 });
  }
}

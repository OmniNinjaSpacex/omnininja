// OmniNinja — Chat endpoint (SSE streaming via OpenRouter)
// Substitui z-ai-web-dev-sdk por OpenRouter (suas 5 chaves: Claude/GPT/Kimi/Grok/Gemini).
// POST { messages: [{role, content}], model?: 'claude'|'chatgpt'|'kimi'|'grok'|'gemini' }
// -> text/event-stream de tokens (streaming REAL do OpenRouter).

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { completionStream, type OpenRouterModel, type ChatMessage } from '@/lib/openrouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYSTEM_PROMPT = `Você é o OmniNinja, um agente de IA autônomo inspirado no Manus AI e no Ninja AI. Você pode responder diretamente (modo Chat) ou abrir o "Computador" com sandbox, terminal e navegador reais para executar tarefas (modo Agent / Agent MAX).

Características:
- Responda SEMPRE em português do Brasil, de forma clara e útil.
- Use Markdown (headings, listas, **negrito**, \`código inline\`, blocos de código com linguagem).
- Se o usuário pedir algo que exija execução real (criar site, pesquisar, rodar código), sugira mudar para o modo Agent.
- Seja conciso em perguntas simples, detalhado em tarefas complexas.
- Você orquestra vários modelos (Claude, GPT, Gemini, Kimi, Grok) via OpenRouter, com fallback automático.`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const model = (body.model as OpenRouterModel) || undefined;
  const lastUser = [...incoming].reverse().find((m: any) => m.role === 'user');

  if (!lastUser) {
    return new Response(JSON.stringify({ error: 'messages required' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  const consume = await consumeCredits(user.id, CREDIT_COSTS.chat_message, 'chat_message');
  if (!consume.ok && consume.remaining === 0) {
    return new Response(JSON.stringify({ error: 'Créditos insuficientes' }), {
      status: 402, headers: { 'content-type': 'application/json' },
    });
  }

  const userMsg = await db.message.create({
    data: { userId: user.id, role: 'user', content: lastUser.content },
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...incoming
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      let fullText = '';
      let usedModel = '';
      try {
        send({ type: 'start', credits: consume.remaining });
        const result = await completionStream(
          { messages, model, temperature: 0.7, maxTokens: 256, fallback: true },
          (delta) => {
            fullText += delta;
            send({ type: 'delta', text: delta });
          }
        );
        usedModel = result.model;

        if (!fullText) {
          send({ type: 'error', error: 'Resposta vazia do modelo' });
        }

        await db.message.create({
          data: { userId: user.id, role: 'assistant', content: fullText, model: usedModel },
        });
        send({ type: 'done', credits: consume.remaining - 1, model: usedModel });
      } catch (err: any) {
        send({ type: 'error', error: err?.message ?? 'LLM error' });
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

// GET /api/chat — resposta rápida não-streaming (usado pelo classify e respostas simples).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  if (!q) return Response.json({ error: 'q required' }, { status: 400 });
  const { completion } = await import('@/lib/openrouter');
  try {
    const r = await completion({
      messages: [
        { role: 'system', content: 'Responda em português, em até 2 frases.' },
        { role: 'user', content: q },
      ],
      fallback: true,
    });
    return Response.json({ text: r.content, model: r.model });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

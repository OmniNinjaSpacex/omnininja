// OmniNinja — production Chat endpoint
// Native OpenAI Responses API through the compatibility client in @/lib/openrouter.
// POST { messages, model? } -> SSE text stream.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { completionStream, completion, type OpenRouterModel, type ChatMessage } from '@/lib/openrouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CHAT_MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `Você é o OmniNinja, um assistente de IA generalista com uma única interface de conversa. O sistema decide automaticamente, por trás do chat, quando usar ferramentas e execução de agente.

Neste caminho de conversa direta:
- Responda em português do Brasil, a menos que o usuário peça outro idioma.
- Seja claro, útil, natural e objetivo.
- Use Markdown quando melhorar a resposta.
- Não mencione modos internos, Agent, Agent MAX, roteamento, provedores ou detalhes de infraestrutura sem o usuário perguntar.
- Não diga que executou navegador, terminal, arquivos, deploys ou qualquer ação externa se isso não aconteceu neste caminho.
- Nunca invente resultados de ferramentas, arquivos, sites publicados ou ações concluídas.
- Para o usuário, a experiência deve parecer uma conversa única e contínua.`;

function serviceUnavailable() {
  return Response.json(
    { error: 'OmniNinja Chat indisponível: OPENAI_API_KEY não configurada no servidor.' },
    { status: 503 },
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();

  if (!process.env.OPENAI_API_KEY?.trim()) return serviceUnavailable();

  const body = await req.json().catch(() => ({} as any));
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const model = (body.model as OpenRouterModel) || undefined;
  const lastUser = [...incoming].reverse().find((message: any) => message.role === 'user');

  if (!lastUser || typeof lastUser.content !== 'string' || !lastUser.content.trim()) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  const consume = await consumeCredits(user.id, CREDIT_COSTS.chat_message, 'chat_message');
  if (!consume.ok && consume.remaining === 0) {
    return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });
  }

  await db.message.create({
    data: { userId: user.id, role: 'user', content: lastUser.content },
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...incoming
      .filter((message: any) =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim(),
      )
      .slice(-20)
      .map((message: any) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let fullText = '';
      try {
        send({
          type: 'start',
          credits: consume.remaining,
          engine: 'openai-responses',
        });

        const result = await completionStream(
          {
            messages,
            model,
            maxTokens: CHAT_MAX_TOKENS,
            fallback: false,
          },
          (delta) => {
            fullText += delta;
            send({ type: 'delta', text: delta });
          },
        );

        if (!fullText.trim()) {
          throw new Error('OpenAI retornou uma resposta vazia');
        }

        await db.message.create({
          data: {
            userId: user.id,
            role: 'assistant',
            content: fullText,
            model: result.model,
          },
        });

        send({
          type: 'done',
          credits: Math.max(0, consume.remaining - CREDIT_COSTS.chat_message),
          model: result.model,
        });
      } catch (error: any) {
        send({ type: 'error', error: error?.message || 'OpenAI error' });
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

// Lightweight non-streaming helper used by internal classification/simple calls.
export async function GET(req: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) return serviceUnavailable();

  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  if (!q?.trim()) return Response.json({ error: 'q required' }, { status: 400 });

  try {
    const result = await completion({
      messages: [
        { role: 'system', content: 'Responda em português do Brasil, em até 2 frases.' },
        { role: 'user', content: q },
      ],
      fallback: false,
    });
    return Response.json({ text: result.content, model: result.model });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'OpenAI error' }, { status: 502 });
  }
}

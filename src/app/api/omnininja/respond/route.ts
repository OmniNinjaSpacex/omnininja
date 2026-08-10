// Unified OMNINJA response endpoint.
// One conversation surface; tools and reasoning are internal implementation details.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import {
  runOmniNinjaRuntime,
  type OmniNinjaEffort,
  type RuntimeMessage,
} from '@/lib/omnininja-runtime';
import type { AgentEvent } from '@/lib/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function normalizeEffort(value: unknown): OmniNinjaEffort {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function creditCost(effort: OmniNinjaEffort, thinkingEnabled: boolean): number {
  if (!thinkingEnabled) return CREDIT_COSTS.chat_message;
  if (effort === 'high') return CREDIT_COSTS.chat_message * 4;
  if (effort === 'medium') return CREDIT_COSTS.chat_message * 2;
  return CREDIT_COSTS.chat_message;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      { error: 'OMNINJA indisponível: OPENAI_API_KEY não configurada no servidor.' },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages: RuntimeMessage[] = incoming
    .filter(
      (message: any) =>
        (message?.role === 'user' || message?.role === 'assistant') &&
        typeof message?.content === 'string' &&
        message.content.trim(),
    )
    .slice(-24)
    .map((message: any) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content.trim(),
    }));

  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  const effort = normalizeEffort(body.effort);
  const thinkingEnabled = body.thinkingEnabled !== false;
  const cost = creditCost(effort, thinkingEnabled);
  const consume = await consumeCredits(user.id, cost, 'omnininja_response');

  if (!consume.ok) {
    return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });
  }

  await db.message.create({
    data: {
      userId: user.id,
      role: 'user',
      content: lastUser.content,
      model: 'OMNINJA',
    },
  });

  const task = await db.task.create({
    data: {
      userId: user.id,
      title: lastUser.content.slice(0, 80),
      goal: lastUser.content,
      mode: 'omnininja',
      model: 'OMNINJA',
      status: 'running',
      stepsTotal: effort === 'high' ? 30 : effort === 'medium' ? 14 : 6,
      creditsUsed: cost,
      startedAt: new Date(),
    },
  });

  const taskId = task.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const persistedEvents: { type: string; payload: string }[] = [];

      const onEvent = (event: AgentEvent) => {
        const { screenshotBase64, ...safeEvent } = event as any;
        persistedEvents.push({
          type: event.type,
          payload: JSON.stringify(safeEvent),
        });

        // The client receives compact activity events only. Screenshots remain
        // internal because the product is a chat-first experience.
        if (event.type === 'STEP_STARTED' || event.type === 'STEP_COMPLETED' || event.type === 'TASK_STARTED') {
          send({ type: 'activity', event: safeEvent });
        }
      };

      try {
        send({
          type: 'start',
          taskId,
          model: 'OMNINJA',
          effort,
          thinkingEnabled,
          credits: consume.remaining,
        });

        const finalText = await runOmniNinjaRuntime({
          messages,
          effort,
          thinkingEnabled,
          taskId,
          onEvent,
        });

        if (persistedEvents.length > 0) {
          await db.eventRow.createMany({
            data: persistedEvents.map((event) => ({
              taskId,
              type: event.type,
              payload: event.payload,
            })),
          });
        }

        await db.message.create({
          data: {
            userId: user.id,
            taskId,
            role: 'assistant',
            content: finalText,
            model: 'OMNINJA',
          },
        });

        await db.task.update({
          where: { id: taskId },
          data: {
            status: 'completed',
            summary: finalText.slice(0, 500),
            finishedAt: new Date(),
          },
        });

        send({ type: 'final', taskId, text: finalText, model: 'OMNINJA' });
        send({ type: 'done', taskId, model: 'OMNINJA' });
      } catch (error: any) {
        const message = error?.message || 'Falha no OMNINJA';

        if (persistedEvents.length > 0) {
          await db.eventRow.createMany({
            data: persistedEvents.map((event) => ({
              taskId,
              type: event.type,
              payload: event.payload,
            })),
          }).catch(() => {});
        }

        await db.task.update({
          where: { id: taskId },
          data: {
            status: 'failed',
            summary: String(message).slice(0, 500),
            finishedAt: new Date(),
          },
        }).catch(() => {});

        send({ type: 'error', taskId, error: message });
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

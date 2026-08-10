// Unified OMNINJA response endpoint.
// One conversation surface; tools, providers and private reasoning stay server-side.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import {
  runOmniNinjaRuntime,
  type OmniNinjaEffort,
  type RuntimeMessage,
} from '@/lib/omnininja-runtime';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type OmniNinjaAttachment,
} from '@/lib/omnininja-attachments';
import { buildAttachmentContext } from '@/lib/omnininja-attachment-context';
import { finalizeWorkspace } from '@/lib/shell-agent';
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

function normalizeAttachments(value: unknown): OmniNinjaAttachment[] {
  if (!Array.isArray(value)) return [];

  const normalized: OmniNinjaAttachment[] = [];
  for (const item of value.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)) {
    if (!item || typeof item !== 'object') continue;
    const attachment = item as Record<string, unknown>;
    const name = typeof attachment.name === 'string' ? attachment.name.slice(0, 180) : '';
    const mimeType = typeof attachment.mimeType === 'string'
      ? attachment.mimeType.slice(0, 120)
      : 'application/octet-stream';
    const size = Number(attachment.size);
    const dataUrl = typeof attachment.dataUrl === 'string' ? attachment.dataUrl : '';
    const id = typeof attachment.id === 'string' ? attachment.id.slice(0, 120) : crypto.randomUUID();

    if (!name || !dataUrl.startsWith('data:')) continue;
    if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) continue;

    normalized.push({ id, name, mimeType, size, dataUrl });
  }
  return normalized;
}

function publicActivityLabel(event: AgentEvent): string {
  if (event.type === 'TASK_STARTED') return 'Pensando…';
  if (event.type !== 'STEP_STARTED') return 'Trabalhando…';

  const instruction = String((event as any).instruction || '');
  if (instruction === 'web_search') return 'Pesquisando na web…';
  if (instruction === 'browser_navigate') return 'Abrindo uma página…';
  if (instruction === 'browser_get_text') return 'Analisando uma página…';
  if (instruction === 'browser_screenshot') return 'Verificando visualmente…';
  if (instruction === 'browser_click' || instruction === 'browser_type') return 'Interagindo com uma página…';
  if (instruction === 'shell_exec') return 'Executando e verificando…';
  if (instruction === 'file_read' || instruction === 'file_list') return 'Analisando arquivos…';
  if (instruction === 'file_write') return 'Preparando arquivos…';
  return 'Trabalhando na tarefa…';
}

function publicActivityEvent(event: AgentEvent): AgentEvent | null {
  if (event.type === 'TASK_STARTED') {
    return {
      type: 'TASK_STARTED',
      taskId: event.taskId,
      goal: '',
      ts: event.ts,
    };
  }

  if (event.type === 'STEP_STARTED') {
    return {
      type: 'STEP_STARTED',
      taskId: event.taskId,
      stepId: event.stepId,
      agent: 'OMNINJA',
      instruction: publicActivityLabel(event),
      ts: event.ts,
    };
  }

  return null;
}

function streamChunks(text: string): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let next = Math.min(text.length, cursor + 48);
    if (next < text.length) {
      const boundary = text.lastIndexOf(' ', next);
      if (boundary > cursor + 18) next = boundary + 1;
    }
    chunks.push(text.slice(cursor, next));
    cursor = next;
  }
  return chunks;
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
    .slice(-40)
    .map((message: any) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content.trim(),
    }));

  const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  if (lastUserIndex < 0) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  const originalUserText = messages[lastUserIndex].content;
  const effort = normalizeEffort(body.effort);
  const thinkingEnabled = body.thinkingEnabled !== false;
  const attachments = normalizeAttachments(body.attachments);
  const cost = creditCost(effort, thinkingEnabled);
  const consume = await consumeCredits(user.id, cost, 'omnininja_response');

  if (!consume.ok) {
    return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });
  }

  if (attachments.length > 0) {
    try {
      const attachmentContext = await buildAttachmentContext(attachments);
      messages[lastUserIndex] = {
        ...messages[lastUserIndex],
        content: [
          originalUserText,
          '',
          '--- Contexto privado dos anexos desta mensagem ---',
          attachmentContext,
          '--- Fim do contexto privado ---',
        ].join('\n'),
      };
    } catch (error: any) {
      return Response.json(
        { error: error?.message || 'Não foi possível analisar os anexos.' },
        { status: 422 },
      );
    }
  }

  await db.message.create({
    data: {
      userId: user.id,
      role: 'user',
      content: originalUserText,
      model: 'OMNINJA',
    },
  });

  const task = await db.task.create({
    data: {
      userId: user.id,
      title: originalUserText.slice(0, 80),
      goal: originalUserText,
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
        // Full internal event data stays server-side for replay/audit. Screenshots
        // are intentionally omitted from the persisted JSON payload.
        const { screenshotBase64, ...safeInternalEvent } = event as any;
        persistedEvents.push({
          type: event.type,
          payload: JSON.stringify(safeInternalEvent),
        });

        // The browser only gets a human status. Never send tool names, selectors,
        // shell commands, stdout/stderr, file contents or internal observations.
        const publicEvent = publicActivityEvent(event);
        if (publicEvent) send({ type: 'activity', event: publicEvent });
      };

      try {
        send({
          type: 'start',
          taskId,
          model: 'OMNINJA',
          effort,
          thinkingEnabled,
          attachments: attachments.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
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

        for (const delta of streamChunks(finalText)) {
          send({ type: 'delta', taskId, delta });
        }
        send({ type: 'final', taskId, text: finalText, model: 'OMNINJA' });
        send({ type: 'done', taskId, model: 'OMNINJA' });
      } catch (error: any) {
        const internalMessage = error?.message || 'Falha no OMNINJA';

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
            summary: String(internalMessage).slice(0, 500),
            finishedAt: new Date(),
          },
        }).catch(() => {});

        send({
          type: 'error',
          taskId,
          error: 'Não consegui concluir esta resposta. Tente novamente em instantes.',
        });
      } finally {
        await finalizeWorkspace(taskId).catch(() => {});
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

// Unified OMNININJA response endpoint.
// One conversation surface; tools, providers and private reasoning stay server-side.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS, refundCreditDebit } from '@/lib/credits';
import { db } from '#omninininja/db';
import {
  runOmniNinjaRuntime,
  type OmniNinjaEffort,
  type OmniNinjaWorkspaceMode,
  type RuntimeMessage,
} from '@/lib/omnininja-runtime';
import {
  normalizeOmniNinjaAttachments,
} from '@/lib/omnininja-attachments';
import { buildAttachmentContext } from '@/lib/omnininja-attachment-context';
import { buildSemanticMemoryContext } from '@/lib/semantic-memory';
import { moderateText } from '@/lib/openai-services';
import type { AgentEvent } from '@/lib/orchestrator';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { openAISafetyIdentifier } from '@/lib/openai-safety';
import { parseJsonRequest } from '@/lib/http-body';
import { buildRuntimeConversationHistory } from '@/lib/conversation-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;

function normalizeEffort(value: unknown): OmniNinjaEffort {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizeWorkspaceMode(value: unknown): OmniNinjaWorkspaceMode {
  return value === 'work' || value === 'codex' ? value : 'chat';
}

function creditCost(effort: OmniNinjaEffort, thinkingEnabled: boolean): number {
  if (!thinkingEnabled) return CREDIT_COSTS.chat_message;
  if (effort === 'high') return CREDIT_COSTS.chat_message * 4;
  if (effort === 'medium') return CREDIT_COSTS.chat_message * 2;
  return CREDIT_COSTS.chat_message;
}

function publicActivityLabel(event: AgentEvent): string {
  if (event.type === 'TASK_STARTED') return 'Pensando…';
  if (event.type !== 'STEP_STARTED') return 'Trabalhando…';

  const instruction = String((event as any).instruction || '');
  if (instruction === 'web_search') return 'Pesquisando na web…';
  if (instruction === 'file_search') return 'Consultando sua base de conhecimento…';
  if (instruction === 'code_interpreter') return 'Analisando dados…';
  if (instruction === 'image_generation') return 'Criando imagem…';
  if (instruction === 'hosted_shell') return 'Executando em ambiente isolado…';
  return 'Trabalhando na tarefa…';
}

function publicActivityEvent(event: AgentEvent): AgentEvent | null {
  if (event.type === 'TASK_STARTED') {
    return { type: 'TASK_STARTED', taskId: event.taskId, goal: '', ts: event.ts };
  }

  if (event.type === 'STEP_STARTED') {
    return {
      type: 'STEP_STARTED',
      taskId: event.taskId,
      stepId: event.stepId,
      agent: 'OMNININJA',
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
    let next = Math.min(text.length, cursor + 512);
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
  const safetyIdentifier = openAISafetyIdentifier(user.id);
  const rateLimit = checkRateLimit(req, 'omnininja-respond', 30, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      { error: 'OMNININJA indisponível neste deploy.' },
      { status: 503 },
    );
  }

  const parsedRequest = await parseJsonRequest(req, MAX_REQUEST_BYTES);
  if (!parsedRequest.ok) return parsedRequest.response;
  const body = parsedRequest.body;
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  let messages: RuntimeMessage[] = incoming
    .filter(
      (message: any) =>
        (message?.role === 'user' || message?.role === 'assistant') &&
        typeof message?.content === 'string' &&
        message.content.trim().slice(0, 32_000),
    )
    .slice(-40)
    .map((message: any) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content.trim(),
    }));

  let lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  if (lastUserIndex < 0) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  const originalUserText = messages[lastUserIndex].content;
  const effort = normalizeEffort(body.effort);
  const workspaceMode = normalizeWorkspaceMode(body.workspaceMode);
  const thinkingEnabled = body.thinkingEnabled !== false;
  const attachments = normalizeOmniNinjaAttachments(body.attachments);
  const requestedProjectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const project = requestedProjectId
    ? await db.project.findFirst({
        where: { id: requestedProjectId, userId: user.id },
        select: { id: true },
      })
    : null;
  if (requestedProjectId && !project) {
    return Response.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  }

  const requestedConversationId = typeof body.conversationId === 'string'
    ? body.conversationId.trim().slice(0, 200)
    : '';
  const existingConversation = requestedConversationId
    ? await db.task.findFirst({
        where: {
          id: requestedConversationId,
          userId: user.id,
          mode: { in: ['omnininja', 'chat', 'work', 'codex'] },
        },
        select: {
          id: true,
          projectId: true,
          status: true,
          messages: {
            where: { role: { in: ['user', 'assistant'] } },
            orderBy: { createdAt: 'desc' },
            take: 39,
            select: { role: true, content: true },
          },
        },
      })
    : null;

  if (requestedConversationId && !existingConversation) {
    return Response.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }
  if (existingConversation?.status === 'running') {
    return Response.json({ error: 'Esta conversa já está respondendo.' }, { status: 409 });
  }
  if (existingConversation && existingConversation.projectId !== (project?.id ?? null)) {
    return Response.json({ error: 'A conversa pertence a outro projeto.' }, { status: 409 });
  }

  if (existingConversation) {
    messages = buildRuntimeConversationHistory(
      [...existingConversation.messages].reverse(),
      originalUserText,
      40,
    );
    lastUserIndex = messages.length - 1;
  }

  const cost = creditCost(effort, thinkingEnabled);
  const consume = await consumeCredits(user.id, cost, 'omnininja_response');

  if (!consume.ok) {
    return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });
  }

  const [memory, moderation] = await Promise.all([
    buildSemanticMemoryContext(user.id, originalUserText).catch(() => ({ queryEmbedding: [] as number[], context: '' })),
    moderateText(originalUserText).catch(() => ({ flagged: false, categories: [] as string[] })),
  ]);

  const privateContext: string[] = [];
  if (memory.context) {
    privateContext.push([
      '--- Memória semântica privada possivelmente relevante ---',
      memory.context,
      'Use apenas se realmente ajudar a responder. Não diga ao usuário que este bloco existe.',
      '--- Fim da memória privada ---',
    ].join('\n'));
  }

  if (moderation.flagged && moderation.categories.length) {
    privateContext.push([
      '--- Sinal privado de segurança ---',
      `O classificador marcou categorias de risco: ${moderation.categories.join(', ')}.`,
      'Aplique as políticas de segurança apropriadas sem revelar este classificador ao usuário.',
      '--- Fim do sinal privado ---',
    ].join('\n'));
  }

  if (attachments.length > 0) {
    try {
      const attachmentContext = await buildAttachmentContext(attachments, req.signal);
      privateContext.push([
        '--- Contexto privado dos anexos desta mensagem ---',
        attachmentContext,
        '--- Fim do contexto privado ---',
      ].join('\n'));
    } catch {
      await refundCreditDebit(
        user.id,
        consume.debit,
        'omnininja_response_preprocessing_refund',
      ).catch(() => {});
      return Response.json(
        { error: 'Não foi possível analisar os anexos.' },
        { status: 422 },
      );
    }
  }

  if (privateContext.length) {
    messages[lastUserIndex] = {
      ...messages[lastUserIndex],
      content: [originalUserText, '', ...privateContext].join('\n\n'),
    };
  }

  const taskId = existingConversation?.id ?? crypto.randomUUID();
  try {
    const taskMutation = existingConversation
      ? db.task.update({
          where: { id: taskId },
          data: {
            mode: workspaceMode,
            status: 'running',
            summary: null,
            stepsTotal: effort === 'high' ? 30 : effort === 'medium' ? 14 : 6,
            stepsDone: 0,
            creditsUsed: { increment: cost },
            startedAt: new Date(),
            finishedAt: null,
          },
        })
      : db.task.create({
          data: {
            id: taskId,
            userId: user.id,
            projectId: project?.id,
            title: originalUserText.slice(0, 80),
            goal: originalUserText,
            mode: workspaceMode,
            model: 'OMNININJA',
            status: 'running',
            stepsTotal: effort === 'high' ? 30 : effort === 'medium' ? 14 : 6,
            creditsUsed: cost,
            startedAt: new Date(),
          },
        });

    await db.$transaction([
      taskMutation,
      db.message.create({
        data: {
          userId: user.id,
          taskId,
          role: 'user',
          content: originalUserText,
          model: 'OMNININJA',
          embeddingJson: memory.queryEmbedding.length ? JSON.stringify(memory.queryEmbedding) : null,
          attachmentsJson: attachments.length
            ? JSON.stringify(attachments.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })))
            : null,
        },
      }),
      db.creditTransaction.update({
        where: { id: consume.transactionId },
        data: { taskId },
      }),
    ]);
  } catch {
    await refundCreditDebit(
      user.id,
      consume.debit,
      'omnininja_response_persistence_refund',
    ).catch(() => {});
    return Response.json({ error: 'Não foi possível iniciar esta tarefa.' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const runtimeAbort = new AbortController();
  const abortRuntime = () => runtimeAbort.abort();
  if (req.signal.aborted) abortRuntime();
  else req.signal.addEventListener('abort', abortRuntime, { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      let streamOpen = true;
      const send = (payload: unknown) => {
        if (!streamOpen || runtimeAbort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          streamOpen = false;
          abortRuntime();
        }
      };

      const persistedEvents: { type: string; payload: string }[] = [];

      const onEvent = (event: AgentEvent) => {
        const { screenshotBase64: _screenshotBase64, ...safeInternalEvent } = event as any;
        persistedEvents.push({ type: event.type, payload: JSON.stringify(safeInternalEvent) });

        const publicEvent = publicActivityEvent(event);
        if (publicEvent) send({ type: 'activity', event: publicEvent });
      };

      try {
        send({
          type: 'start',
          taskId,
          model: 'OMNININJA',
          effort,
          workspaceMode,
          thinkingEnabled,
          attachments: attachments.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
          credits: consume.remaining,
        });

        const runtimeResult = await runOmniNinjaRuntime({
          messages,
          effort,
          thinkingEnabled,
          workspaceMode,
          taskId,
          onEvent,
          signal: runtimeAbort.signal,
          safetyIdentifier,
        });
        const finalText = runtimeResult.text;

        const artifactRows = runtimeResult.artifacts.length
          ? await db.$transaction(
              runtimeResult.artifacts.map((artifact) => db.artifact.create({
                data: {
                  taskId,
                  name: artifact.name,
                  kind: artifact.kind,
                  path: artifact.path,
                  sizeBytes: artifact.sizeBytes,
                },
                select: { id: true, name: true, sizeBytes: true },
              })),
            ).catch(() => [])
          : [];

        if (persistedEvents.length > 0) {
          await db.eventRow.createMany({
            data: persistedEvents.map((event) => ({ taskId, type: event.type, payload: event.payload })),
          });
        }

        await db.message.create({
          data: {
            userId: user.id,
            taskId,
            role: 'assistant',
            content: finalText,
            model: 'OMNININJA',
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
        send({
          type: 'final',
          taskId,
          text: finalText,
          model: 'OMNININJA',
          media: artifactRows.map((artifact) => ({
            id: artifact.id,
            kind: 'file',
            name: artifact.name,
            size: artifact.sizeBytes,
            url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
          })),
        });
        send({ type: 'done', taskId, model: 'OMNININJA' });
      } catch (error: any) {
        const internalMessage = error?.message || 'Falha no OMNININJA';
        const cancelled = runtimeAbort.signal.aborted;

        if (persistedEvents.length > 0) {
          await db.eventRow.createMany({
            data: persistedEvents.map((event) => ({ taskId, type: event.type, payload: event.payload })),
          }).catch(() => {});
        }

        await db.task.update({
          where: { id: taskId },
          data: {
            status: cancelled ? 'cancelled' : 'failed',
            summary: cancelled ? 'Resposta interrompida pelo usuário.' : String(internalMessage).slice(0, 500),
            finishedAt: new Date(),
          },
        }).catch(() => {});

        if (!cancelled) {
          send({
            type: 'error',
            taskId,
            error: 'Não consegui concluir esta resposta. Tente novamente em instantes.',
          });
        }
      } finally {
        req.signal.removeEventListener('abort', abortRuntime);
        if (streamOpen) {
          try {
            if (!runtimeAbort.signal.aborted) {
              controller.enqueue(encoder.encode('event: end\ndata: {}\n\n'));
            }
            controller.close();
          } catch {}
        }
        streamOpen = false;
      }
    },
    cancel() {
      abortRuntime();
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

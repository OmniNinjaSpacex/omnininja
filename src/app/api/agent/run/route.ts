// OmniNinja — production Agent runner (SSE)
// POST { goal, mode, model?, browserSessionTicket? }
// Real execution only: OpenAI Responses API + real tools. No simulated fallback.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { runOpenAIAgentLoop } from '@/lib/openai-agent-loop';
import { createInteractiveBrowserSession, runWithBrowserSession } from '@/lib/browser-agent';
import {
  createBrowserSessionTicket,
  verifyBrowserSessionTicket,
} from '@/lib/browser-session-ticket';
import type { AgentEvent } from '@/lib/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function browserReconnectTimeout(): number {
  const value = Number(process.env.BROWSERLESS_RECONNECT_TIMEOUT_MS || 10 * 60 * 1000);
  if (!Number.isFinite(value)) return 10 * 60 * 1000;
  return Math.max(60_000, Math.min(value, 30 * 60 * 1000));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const mode = typeof body.mode === 'string' ? body.mode : 'agent';
  const browserSessionTicket =
    typeof body.browserSessionTicket === 'string' && body.browserSessionTicket.trim()
      ? body.browserSessionTicket.trim()
      : undefined;

  if (!goal) {
    return Response.json({ error: 'goal required' }, { status: 400 });
  }

  if (mode !== 'agent' && mode !== 'agent_max') {
    return Response.json({ error: 'mode must be agent or agent_max' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      { error: 'OmniNinja Agent indisponível: OPENAI_API_KEY não configurada no servidor.' },
      { status: 503 },
    );
  }

  // Resolve human-takeover browser state before charging credits. The client
  // can never submit a raw Browserless reconnect endpoint.
  let requestedBrowserWSEndpoint: string | undefined;
  if (browserSessionTicket) {
    try {
      requestedBrowserWSEndpoint = verifyBrowserSessionTicket(
        browserSessionTicket,
        user.id,
      ).browserWSEndpoint;
    } catch {
      return Response.json(
        { error: 'browserSessionTicket inválido, expirado ou não pertence a esta conta.' },
        { status: 400 },
      );
    }
  }

  const effectiveModel = process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5';
  const cost = CREDIT_COSTS.agent_step * 5 + CREDIT_COSTS.browser_action * 3;
  const consume = await consumeCredits(user.id, cost, 'task_run');
  if (!consume.ok && consume.remaining === 0) {
    return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });
  }

  const task = await db.task.create({
    data: {
      userId: user.id,
      title: goal.slice(0, 80),
      goal,
      mode,
      model: effectiveModel,
      status: 'running',
      stepsTotal: mode === 'agent_max' ? 40 : 20,
      creditsUsed: cost,
      startedAt: new Date(),
    },
  });

  const taskId = task.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const events: { type: string; payload: string }[] = [];
      let finalSummary = '';
      let agentFailed = false;
      let agentFailureMessage = '';

      const onEvent = (event: AgentEvent) => {
        const { screenshotBase64, ...safeEvent } = event as any;

        // Screenshots can be megabytes. Stream them to the live client, but never
        // write base64 image blobs into the relational event log.
        events.push({ type: event.type, payload: JSON.stringify(safeEvent) });

        if (event.type === 'TASK_COMPLETED') finalSummary = event.summary;
        if (event.type === 'TASK_FAILED') {
          agentFailed = true;
          agentFailureMessage = event.error;
        }

        if (screenshotBase64) {
          send({ type: 'event', event: safeEvent, hasScreenshot: true });
          send({ type: 'screenshot', taskId, data: screenshotBase64 });
        } else {
          send({ type: 'event', event: safeEvent });
        }
      };

      try {
        let browserWSEndpoint = requestedBrowserWSEndpoint;
        let browserLiveURL: string | undefined;
        let browserExpiresInMs: number | undefined;
        let browserTicketForClient: string | undefined;

        if (!browserWSEndpoint && process.env.BROWSERLESS_API_KEY?.trim()) {
          try {
            const session = await createInteractiveBrowserSession(
              'https://www.google.com/',
              browserReconnectTimeout(),
            );
            browserWSEndpoint = session.browserWSEndpoint;
            browserLiveURL = session.liveURL;
            browserExpiresInMs = session.expiresInMs;

            // Ticket creation is optional for automatic Agent execution. If the
            // signing secret is configured, the UI can securely resume/take over
            // this exact browser session without ever seeing the raw endpoint.
            try {
              browserTicketForClient = createBrowserSessionTicket({
                userId: user.id,
                browserWSEndpoint: session.browserWSEndpoint,
                expiresInMs: session.expiresInMs,
              });
            } catch {
              browserTicketForClient = undefined;
            }
          } catch (browserError: any) {
            onEvent({
              type: 'AGENT_THINKING',
              taskId,
              agent: 'Browser',
              text: `Sessão Browserless interativa indisponível: ${browserError?.message || 'erro desconhecido'}. O Agent continuará sem afirmar que o navegador foi aberto.`,
              ts: Date.now(),
            });
          }
        }

        send({
          type: 'start',
          taskId,
          credits: consume.remaining,
          engine: 'openai-responses-tools',
          model: effectiveModel,
          browserTakeover: Boolean(browserWSEndpoint),
        });

        if (browserLiveURL) {
          send({
            type: 'browser_session',
            taskId,
            liveURL: browserLiveURL,
            browserSessionTicket: browserTicketForClient,
            expiresInMs: browserExpiresInMs,
          });
        }

        await runWithBrowserSession(browserWSEndpoint, () =>
          runOpenAIAgentLoop({ goal, mode, taskId, onEvent }),
        );

        if (agentFailed) {
          throw new Error(agentFailureMessage || 'Agent task failed');
        }

        if (!finalSummary) {
          throw new Error('O Agent encerrou sem confirmar a conclusão da tarefa.');
        }

        if (events.length > 0) {
          await db.eventRow.createMany({
            data: events.map((event) => ({ taskId, type: event.type, payload: event.payload })),
          });
        }

        await db.task.update({
          where: { id: taskId },
          data: {
            status: 'completed',
            summary: finalSummary.slice(0, 500),
            finishedAt: new Date(),
          },
        });

        send({ type: 'done', taskId, model: effectiveModel });
      } catch (err: any) {
        const message = err?.message || 'Agent error';

        if (events.length > 0) {
          await db.eventRow.createMany({
            data: events.map((event) => ({ taskId, type: event.type, payload: event.payload })),
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

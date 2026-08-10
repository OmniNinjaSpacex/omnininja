// OmniNinja — Real Agent Run endpoint (SSE)
// POST { goal, mode, model, browserWSEndpoint? }
// Uses native OpenAI structured tool calling when OPENAI_API_KEY is configured.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { runAgentLoop } from '@/lib/agent-loop';
import { runOpenAIAgentLoop } from '@/lib/openai-agent-loop';
import { createInteractiveBrowserSession, runWithBrowserSession } from '@/lib/browser-agent';
import type { AgentEvent } from '@/lib/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function browserReconnectTimeout(): number {
  const value = Number(process.env.BROWSERLESS_RECONNECT_TIMEOUT_MS || 10000);
  if (!Number.isFinite(value)) return 10000;
  return Math.max(5000, Math.min(value, 300000));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const goal = body.goal;
  const mode = body.mode || 'agent';
  const model = body.model || 'chatgpt';
  const requestedBrowserWSEndpoint = typeof body.browserWSEndpoint === 'string'
    ? body.browserWSEndpoint
    : undefined;

  if (!goal || typeof goal !== 'string') {
    return new Response(JSON.stringify({ error: 'goal required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const cost = CREDIT_COSTS.agent_step * 5 + CREDIT_COSTS.browser_action * 3;
  const consume = await consumeCredits(user.id, cost, 'task_run');
  if (!consume.ok && consume.remaining === 0) {
    return new Response(JSON.stringify({ error: 'Créditos insuficientes' }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    });
  }

  const useStructuredOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
  const effectiveModel = useStructuredOpenAI
    ? (process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5')
    : model;

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
      const send = (obj: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const events: { type: string; payload: string }[] = [];
      let finalSummary = '';
      let agentFailed = false;
      let agentFailureMessage = '';

      const onEvent = (event: AgentEvent) => {
        const { screenshotBase64, ...sendable } = event as any;
        events.push({ type: event.type, payload: JSON.stringify(event) });

        if (event.type === 'TASK_COMPLETED') finalSummary = event.summary;
        if (event.type === 'TASK_FAILED') {
          agentFailed = true;
          agentFailureMessage = event.error;
        }

        if (screenshotBase64) {
          send({ type: 'event', event: sendable, hasScreenshot: true });
          send({ type: 'screenshot', taskId, data: screenshotBase64 });
        } else {
          send({ type: 'event', event: sendable });
        }
      };

      try {
        let browserWSEndpoint = requestedBrowserWSEndpoint;
        let browserLiveURL: string | undefined;
        let browserExpiresInMs: number | undefined;

        // Each agent task gets its own Browserless session when Browserless is configured.
        // A client-provided reconnect endpoint takes precedence (human takeover/login flow).
        if (!browserWSEndpoint && process.env.BROWSERLESS_API_KEY?.trim()) {
          try {
            const session = await createInteractiveBrowserSession(
              'https://www.google.com/',
              browserReconnectTimeout(),
            );
            browserWSEndpoint = session.browserWSEndpoint;
            browserLiveURL = session.liveURL;
            browserExpiresInMs = session.expiresInMs;
          } catch (browserError: any) {
            // Do not kill the task: browser-agent can still attempt its normal Browserless/local fallback.
            onEvent({
              type: 'AGENT_THINKING',
              taskId,
              agent: 'Browser',
              text: `Sessao interativa indisponivel; usando fallback de navegador: ${browserError?.message || 'erro desconhecido'}`,
              ts: Date.now(),
            });
          }
        }

        send({
          type: 'start',
          taskId,
          credits: consume.remaining,
          engine: useStructuredOpenAI ? 'openai-responses-tools' : 'legacy-agent-loop',
          model: effectiveModel,
          browserTakeover: Boolean(browserWSEndpoint),
        });

        if (browserLiveURL) {
          send({
            type: 'browser_session',
            taskId,
            liveURL: browserLiveURL,
            expiresInMs: browserExpiresInMs,
          });
        }

        const executeAgent = async () => {
          if (useStructuredOpenAI) {
            return runOpenAIAgentLoop({ goal, mode, taskId, onEvent });
          }
          return runAgentLoop({ goal, mode, model, taskId, onEvent });
        };

        await runWithBrowserSession(browserWSEndpoint, executeAgent);

        if (agentFailed) {
          throw new Error(agentFailureMessage || 'Agent task failed');
        }

        send({ type: 'done', taskId, model: effectiveModel });

        if (events.length > 0) {
          await db.eventRow.createMany({
            data: events.map((e) => ({ taskId, type: e.type, payload: e.payload })),
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
      } catch (err: any) {
        send({ type: 'error', error: err?.message || 'Agent error' });

        if (events.length > 0) {
          await db.eventRow.createMany({
            data: events.map((e) => ({ taskId, type: e.type, payload: e.payload })),
          }).catch(() => {});
        }

        await db.task.update({
          where: { id: taskId },
          data: {
            status: 'failed',
            summary: String(err?.message || '').slice(0, 500),
            finishedAt: new Date(),
          },
        }).catch(() => {});
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

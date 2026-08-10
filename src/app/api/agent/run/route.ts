// OmniNinja — Real Agent Run endpoint (SSE)
// POST { goal, mode, model, browserWSEndpoint? }
// Native OpenAI Responses tool-calling is preferred when OPENAI_API_KEY exists.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { runAgentLoop } from '@/lib/agent-loop';
import { runOpenAIAgentLoop } from '@/lib/openai-agent-loop';
import { runWithBrowserSession } from '@/lib/browser-agent';
import type { AgentEvent } from '@/lib/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function useNativeOpenAI(model: string): boolean {
  if (!process.env.OPENAI_API_KEY?.trim()) return false;
  if ((process.env.OMNININJA_LLM_PROVIDER || '').toLowerCase() === 'openai') return true;
  const normalized = String(model || '').toLowerCase();
  return normalized === 'chatgpt' || normalized === 'openai' || normalized.startsWith('gpt-');
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const goal = body.goal;
  const mode = body.mode || 'agent';
  const model = body.model || 'chatgpt';
  const browserWSEndpoint = typeof body.browserWSEndpoint === 'string' ? body.browserWSEndpoint : undefined;

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

  const nativeOpenAI = useNativeOpenAI(model);
  const effectiveModel = nativeOpenAI
    ? (process.env.OPENAI_AGENT_MODEL || 'gpt-5.2')
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
      let taskFailed = false;
      let taskError = '';

      const onEvent = (event: AgentEvent) => {
        const { screenshotBase64, ...sendable } = event as any;
        events.push({ type: event.type, payload: JSON.stringify(event) });

        if (event.type === 'TASK_COMPLETED') finalSummary = event.summary;
        if (event.type === 'TASK_FAILED') {
          taskFailed = true;
          taskError = event.error;
        }

        if (screenshotBase64) {
          send({ type: 'event', event: sendable, hasScreenshot: true });
          send({ type: 'screenshot', taskId, data: screenshotBase64 });
        } else {
          send({ type: 'event', event: sendable });
        }
      };

      try {
        send({
          type: 'start',
          taskId,
          credits: consume.remaining,
          engine: nativeOpenAI ? 'openai-responses' : 'legacy-provider',
          model: effectiveModel,
          browserTakeover: Boolean(browserWSEndpoint),
        });

        const executeAgent = async () => {
          if (nativeOpenAI) {
            return runOpenAIAgentLoop({ goal, mode, model: effectiveModel, taskId, onEvent });
          }
          return runAgentLoop({ goal, mode, model, taskId, onEvent });
        };

        await runWithBrowserSession(browserWSEndpoint, executeAgent);

        if (taskFailed) throw new Error(taskError || 'Agent task failed');

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
          data: { status: 'failed', summary: String(err?.message || '').slice(0, 500), finishedAt: new Date() },
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

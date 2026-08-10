// OmniNinja — Real Agent Run endpoint (SSE)
// POST { goal, mode, model?, browserWSEndpoint? } -> real OpenAI tool loop.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { runOpenAIAgentTools } from '@/lib/openai-agent-tools';
import { runWithBrowserSession } from '@/lib/browser-agent';
import type { AgentEvent } from '@/lib/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const goal = body.goal;
  const mode = typeof body.mode === 'string' ? body.mode : 'agent';
  const model = typeof body.model === 'string' ? body.model : 'chatgpt';
  const browserWSEndpoint = typeof body.browserWSEndpoint === 'string'
    ? body.browserWSEndpoint
    : undefined;

  if (!goal || typeof goal !== 'string') {
    return new Response(JSON.stringify({ error: 'goal required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (mode !== 'agent' && mode !== 'agent_max') {
    return new Response(JSON.stringify({ error: 'mode must be agent or agent_max' }), {
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

  const task = await db.task.create({
    data: {
      userId: user.id,
      title: goal.slice(0, 80),
      goal,
      mode,
      model,
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

      const onEvent = (event: AgentEvent) => {
        const { screenshotBase64, ...sendable } = event as any;

        // Avoid storing large screenshot blobs in the relational event log.
        events.push({ type: event.type, payload: JSON.stringify(sendable) });

        if (event.type === 'TASK_COMPLETED') finalSummary = event.summary;

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
          engine: 'openai-responses-tools',
          browserSession: Boolean(browserWSEndpoint),
        });

        await runWithBrowserSession(browserWSEndpoint, async () => {
          await runOpenAIAgentTools({ goal, mode, model, taskId, onEvent });
        });

        send({ type: 'done', taskId });

        if (events.length > 0) {
          await db.eventRow.createMany({
            data: events.map((event) => ({
              taskId,
              type: event.type,
              payload: event.payload,
            })),
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
      } catch (error: any) {
        send({ type: 'error', error: error?.message || 'Agent error' });
        await db.task.update({
          where: { id: taskId },
          data: { status: 'failed', finishedAt: new Date() },
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

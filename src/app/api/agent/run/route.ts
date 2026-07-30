// OmniNinja — Real Agent Run endpoint (SSE)
// POST { goal, mode, model } → runs the REAL agent loop and streams events.
// This replaces the client-side scripted timeline with REAL browser/shell actions.

import { getCurrentUser } from '@/lib/auth';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';
import { db } from '@/lib/db';
import { runAgentLoop } from '@/lib/agent-loop';
import type { AgentEvent } from '@/lib/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 min max — agent_max tasks podem ser longas

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const { goal, mode = 'agent', model = 'claude' } = await req.json().catch(() => ({} as any));

  if (!goal || typeof goal !== 'string') {
    return new Response(JSON.stringify({ error: 'goal required' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  // Consume credits (agent tasks cost more)
  const cost = CREDIT_COSTS.agent_step * 5 + CREDIT_COSTS.browser_action * 3;
  const consume = await consumeCredits(user.id, cost, 'task_run');
  if (!consume.ok && consume.remaining === 0) {
    return new Response(JSON.stringify({ error: 'Créditos insuficientes' }), {
      status: 402, headers: { 'content-type': 'application/json' },
    });
  }

  // Create task in DB
  const task = await db.task.create({
    data: {
      userId: user.id,
      title: goal.slice(0, 80),
      goal,
      mode,
      model,
      status: 'running',
      stepsTotal: 12,
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

      // Collect events for DB persistence
      const events: { type: string; payload: string }[] = [];
      let finalSummary = '';

      const onEvent = (event: AgentEvent) => {
        // Don't send screenshots via SSE (too big) — send a flag instead
        const { screenshotBase64, ...sendable } = event as any;
        const eventToPersist = event;
        events.push({ type: event.type, payload: JSON.stringify(eventToPersist) });

        if (event.type === 'TASK_COMPLETED') {
          finalSummary = event.summary;
        }

        // For BROWSER_ACTION, send a separate screenshot event (base64)
        if (screenshotBase64) {
          send({ type: 'event', event: sendable, hasScreenshot: true });
          // Send screenshot in chunks to avoid SSE line limits
          send({ type: 'screenshot', taskId, data: screenshotBase64 });
        } else {
          send({ type: 'event', event: sendable });
        }
      };

      try {
        send({ type: 'start', taskId, credits: consume.remaining });
        await runAgentLoop({ goal, mode, model, taskId, onEvent });
        send({ type: 'done', taskId });

        // Persist events to DB
        if (events.length > 0) {
          await db.eventRow.createMany({
            data: events.map((e) => ({ taskId, type: e.type, payload: e.payload })),
          });
        }
        // Update task status
        await db.task.update({
          where: { id: taskId },
          data: {
            status: 'completed',
            summary: finalSummary.slice(0, 500),
            finishedAt: new Date(),
          },
        });
      } catch (err: any) {
        send({ type: 'error', error: err.message });
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

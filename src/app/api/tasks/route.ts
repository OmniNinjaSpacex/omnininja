import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildEventTimeline } from '@/lib/orchestrator';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';

// Create a task. In production this enqueues a BullMQ job that instantiates
// the Orchestrator in an isolated Docker sandbox and streams events over
// WebSocket. Here we persist the task + return a scripted event timeline the
// client replays to demonstrate the Event Stream / Computer panel.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const { goal, mode = 'agent', model = 'glm' } = await req.json().catch(() => ({} as any));
  if (!goal || typeof goal !== 'string') {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 });
  }

  const timeline = buildEventTimeline('pending', goal);
  const planEvent = timeline.find((e) => e.type === 'PLAN_CREATED');
  const stepsCount = planEvent && planEvent.type === 'PLAN_CREATED' ? planEvent.steps.length : 5;
  const cost = CREDIT_COSTS.agent_step * stepsCount + CREDIT_COSTS.browser_action * 3;

  const consume = await consumeCredits(user.id, cost, 'task_run');
  if (!consume.ok) {
    return NextResponse.json({ error: 'Créditos insuficientes', remaining: consume.remaining }, { status: 402 });
  }

  const task = await db.task.create({
    data: {
      userId: user.id,
      title: goal.slice(0, 80),
      goal,
      mode,
      model,
      status: 'running',
      stepsTotal: stepsCount,
      creditsUsed: cost,
      startedAt: new Date(),
    },
  });

  // persist messages + events
  await db.message.create({
    data: { taskId: task.id, userId: user.id, role: 'user', content: goal },
  });

  // store events (json string payload)
  await db.eventRow.createMany({
    data: timeline.map((e) => ({
      taskId: task.id,
      type: e.type,
      payload: JSON.stringify(e),
    })),
  });

  return NextResponse.json({
    taskId: task.id,
    status: task.status,
    creditsUsed: cost,
    remaining: consume.remaining,
    events: timeline,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  const tasks = await db.task.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { _count: { select: { events: true, artifacts: true } } },
  });
  return NextResponse.json({ tasks });
}

// PATCH /api/tasks — update status/summary of a task (called when client finishes replay).
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  const { id, status, summary } = await req.json().catch(() => ({} as any));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const finished = status === 'completed' || status === 'failed';
  const task = await db.task.updateMany({
    where: { id, userId: user.id },
    data: {
      ...(status ? { status } : {}),
      ...(summary ? { summary } : {}),
      ...(finished ? { finishedAt: new Date() } : {}),
    },
  });
  return NextResponse.json({ updated: task.count });
}

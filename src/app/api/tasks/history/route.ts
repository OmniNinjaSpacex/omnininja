import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/tasks/history — list persisted tasks with their events for replay.
// Optional ?id=xxx returns a single task with full event stream.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id) {
    const task = await db.task.findFirst({
      where: { id, userId: user.id },
      include: {
        events: { orderBy: { ts: 'asc' } },
        artifacts: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      task: {
        id: task.id,
        goal: task.goal,
        mode: task.mode,
        model: task.model,
        status: task.status,
        summary: task.summary,
        stepsTotal: task.stepsTotal,
        stepsDone: task.stepsDone,
        creditsUsed: task.creditsUsed,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        events: task.events.map((e) => ({ type: e.type, payload: JSON.parse(e.payload), ts: new Date(e.ts).getTime() })),
        artifacts: task.artifacts,
        messages: task.messages,
      },
    });
  }

  const tasks = await db.task.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { events: true, artifacts: true } } },
  });
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      goal: t.goal,
      mode: t.mode,
      model: t.model,
      status: t.status,
      summary: t.summary,
      stepsTotal: t.stepsTotal,
      stepsDone: t.stepsDone,
      creditsUsed: t.creditsUsed,
      createdAt: t.createdAt,
      finishedAt: t.finishedAt,
      eventCount: t._count.events,
      artifactCount: t._count.artifacts,
    })),
  });
}

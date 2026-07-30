import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

// Parse a human-ish schedule into a next-run Date.
// Supports: 'daily HH:MM', 'weekly DOW HH:MM', 'every Nh', 'once YYYY-MM-DD HH:MM'
function computeNextRun(schedule: string): Date {
  const now = new Date();
  const next = new Date(now);
  const s = schedule.trim().toLowerCase();

  const daily = s.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (daily) {
    next.setHours(+daily[1], +daily[2], 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  const weekly = s.match(/^weekly\s+(\w+)\s+(\d{1,2}):(\d{2})$/);
  if (weekly) {
    const dows = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const target = dows.indexOf(weekly[1]);
    if (target >= 0) {
      next.setHours(+weekly[2], +weekly[3], 0, 0);
      const cur = next.getDay();
      let diff = (target - cur + 7) % 7;
      if (diff === 0 && next <= now) diff = 7;
      next.setDate(next.getDate() + diff);
      return next;
    }
  }

  const every = s.match(/^every\s+(\d+)\s*(h|hour|hours|m|min|mins)$/);
  if (every) {
    const n = +every[1];
    const unit = every[2][0] === 'h' ? 'hours' : 'minutes';
    next.setTime(now.getTime() + (unit === 'hours' ? n : n / 60) * 3600_000);
    return next;
  }

  const once = s.match(/^once\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (once) {
    return new Date(`${once[1]}T${once[2].padStart(2, '0')}:${once[3].padStart(2, '0')}:00`);
  }

  // default: 24h from now
  next.setTime(now.getTime() + 86400_000);
  return next;
}

export async function GET() {
  const user = await getCurrentUser();
  const tasks = await db.scheduledTask.findMany({
    where: { userId: user.id },
    orderBy: { nextRunAt: 'asc' },
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const { title, prompt, mode = 'agent', model = 'glm', schedule } = await req.json().catch(() => ({} as any));
  if (!prompt || !schedule) {
    return NextResponse.json({ error: 'prompt and schedule required' }, { status: 400 });
  }
  const nextRunAt = computeNextRun(schedule);
  const task = await db.scheduledTask.create({
    data: {
      userId: user.id,
      title: title || prompt.slice(0, 60),
      prompt,
      mode,
      model,
      schedule,
      enabled: true,
      nextRunAt,
    },
  });
  return NextResponse.json({ task });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  const { id, enabled } = await req.json().catch(() => ({} as any));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const task = await db.scheduledTask.updateMany({
    where: { id, userId: user.id },
    data: { enabled: !!enabled },
  });
  return NextResponse.json({ updated: task.count });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const task = await db.scheduledTask.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ deleted: task.count });
}

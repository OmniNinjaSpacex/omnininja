import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJsonRequest } from '@/lib/http-body';

// Parse a human-ish schedule into a next-run Date.
// Supports: 'daily HH:MM', 'weekly DOW HH:MM', 'every Nh', 'once YYYY-MM-DD HH:MM'
function computeNextRun(schedule: string): Date | null {
  const now = new Date();
  const next = new Date(now);
  const s = schedule.trim().toLowerCase();

  const daily = s.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (daily) {
    if (+daily[1] > 23 || +daily[2] > 59) return null;
    next.setHours(+daily[1], +daily[2], 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  const weekly = s.match(/^weekly\s+(\w+)\s+(\d{1,2}):(\d{2})$/);
  if (weekly) {
    const dows = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const target = dows.indexOf(weekly[1]);
    if (target >= 0) {
      if (+weekly[2] > 23 || +weekly[3] > 59) return null;
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
    if (!Number.isInteger(n) || n < 1 || n > 43_200) return null;
    const unit = every[2][0] === 'h' ? 'hours' : 'minutes';
    next.setTime(now.getTime() + (unit === 'hours' ? n : n / 60) * 3600_000);
    return next;
  }

  const once = s.match(/^once\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (once) {
    if (+once[2] > 23 || +once[3] > 59) return null;
    const parsed = new Date(`${once[1]}T${once[2].padStart(2, '0')}:${once[3].padStart(2, '0')}:00`);
    return Number.isFinite(parsed.getTime()) && parsed > now ? parsed : null;
  }

  return null;
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
  const parsedRequest = await parseJsonRequest(req, 64 * 1024);
  if (!parsedRequest.ok) return parsedRequest.response;
  const body = parsedRequest.body;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 10_000) : '';
  const schedule = typeof body.schedule === 'string' ? body.schedule.trim().slice(0, 120) : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (!prompt || !schedule) {
    return NextResponse.json({ error: 'prompt and schedule required' }, { status: 400 });
  }
  const nextRunAt = computeNextRun(schedule);
  if (!nextRunAt) {
    return NextResponse.json({ error: 'schedule inválido ou no passado' }, { status: 400 });
  }
  const task = await db.scheduledTask.create({
    data: {
      userId: user.id,
      title: title || prompt.slice(0, 60),
      prompt,
      mode: 'omnininja',
      model: 'OMNINJA',
      schedule,
      enabled: true,
      nextRunAt,
    },
  });
  return NextResponse.json({ task });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  const parsedRequest = await parseJsonRequest(req, 8 * 1024);
  if (!parsedRequest.ok) return parsedRequest.response;
  const { id, enabled } = parsedRequest.body;
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

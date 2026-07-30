import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');
  if (taskId) {
    const messages = await db.message.findMany({ where: { taskId, userId: user.id }, orderBy: { createdAt: 'asc' }, take: 200 });
    return NextResponse.json({ messages });
  }
  const messages = await db.message.findMany({ where: { userId: user.id, taskId: null }, orderBy: { createdAt: 'desc' }, take: 100 });
  return NextResponse.json({ messages });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const { role, content, model } = await req.json().catch(() => ({} as any));
  if (!role || !content) return NextResponse.json({ error: 'role e content obrigatórios' }, { status: 400 });
  const msg = await db.message.create({ data: { userId: user.id, role, content, model } });
  return NextResponse.json({ id: msg.id });
}

export async function DELETE() {
  const user = await getCurrentUser();
  await db.message.deleteMany({ where: { userId: user.id, taskId: null } });
  return NextResponse.json({ ok: true });
}

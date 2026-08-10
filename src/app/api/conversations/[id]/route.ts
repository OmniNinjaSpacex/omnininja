import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await context.params;

  const task = await db.task.findFirst({
    where: { id, userId: user.id, mode: 'omnininja' },
    select: {
      id: true,
      goal: true,
      title: true,
      status: true,
      createdAt: true,
      messages: {
        where: { role: 'assistant' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, model: true, createdAt: true },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  return NextResponse.json({
    conversation: {
      id: task.id,
      title: task.title,
      status: task.status,
      createdAt: task.createdAt,
      messages: [
        {
          id: `user-${task.id}`,
          role: 'user',
          content: task.goal,
          createdAt: task.createdAt,
        },
        ...task.messages,
      ],
    },
  });
}

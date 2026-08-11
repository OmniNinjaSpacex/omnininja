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
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          model: true,
          attachmentsJson: true,
          createdAt: true,
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const persistedMessages = task.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map(({ attachmentsJson, ...message }) => {
      if (!attachmentsJson) return message;
      try {
        const parsed = JSON.parse(attachmentsJson);
        return { ...message, attachments: Array.isArray(parsed) ? parsed : undefined };
      } catch {
        return message;
      }
    });

  return NextResponse.json({
    conversation: {
      id: task.id,
      title: task.title,
      status: task.status,
      createdAt: task.createdAt,
      messages: persistedMessages.some((message) => message.role === 'user')
        ? persistedMessages
        : [
        {
          id: `user-${task.id}`,
          role: 'user',
          content: task.goal,
          createdAt: task.createdAt,
        },
        ...persistedMessages,
      ],
    },
  });
}

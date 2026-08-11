import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '#omninininja/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await context.params;

  const task = await db.task.findFirst({
    where: { id, userId: user.id, mode: { in: ['omnininja', 'chat', 'work', 'codex'] } },
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
      artifacts: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, kind: true, sizeBytes: true },
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
  const lastAssistantIndex = persistedMessages.findLastIndex((message) => message.role === 'assistant');
  const generatedFiles = task.artifacts
    .filter((artifact) => artifact.kind === 'file')
    .map((artifact) => ({
      id: artifact.id,
      kind: 'file',
      name: artifact.name,
      size: artifact.sizeBytes,
      url: `/api/artifacts/${encodeURIComponent(artifact.id)}`,
    }));
  const messagesWithArtifacts = persistedMessages.map((message, index) => (
    index === lastAssistantIndex && generatedFiles.length
      ? { ...message, media: generatedFiles }
      : message
  ));

  return NextResponse.json({
    conversation: {
      id: task.id,
      title: task.title,
      status: task.status,
      createdAt: task.createdAt,
      messages: messagesWithArtifacts.some((message) => message.role === 'user')
        ? messagesWithArtifacts
        : [
        {
          id: `user-${task.id}`,
          role: 'user',
          content: task.goal,
          createdAt: task.createdAt,
        },
        ...messagesWithArtifacts,
      ],
    },
  });
}

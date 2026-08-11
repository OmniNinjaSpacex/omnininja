import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '#omninininja/db';
import { parseJsonRequest } from '@/lib/http-body';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

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
      projectId: true,
      mode: true,
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
      projectId: task.projectId,
      mode: task.mode,
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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'conversation-update', 60, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const parsed = await parseJsonRequest(req, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : undefined;
  const pinned = typeof body.pinned === 'boolean' ? body.pinned : undefined;
  if (title === '' || (title === undefined && pinned === undefined)) {
    return NextResponse.json({ error: 'Alteração inválida.' }, { status: 400 });
  }

  const { id } = await context.params;
  const updated = await db.task.updateMany({
    where: { id, userId: user.id, mode: { in: ['omnininja', 'chat', 'work', 'codex'] } },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(pinned !== undefined ? { pinnedAt: pinned ? new Date() : null } : {}),
    },
  });
  if (!updated.count) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const conversation = await db.task.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      pinnedAt: true,
    },
  });
  return NextResponse.json({ conversation });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'conversation-delete', 30, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const { id } = await context.params;
  const deleted = await db.task.deleteMany({
    where: { id, userId: user.id, mode: { in: ['omnininja', 'chat', 'work', 'codex'] } },
  });
  if (!deleted.count) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}

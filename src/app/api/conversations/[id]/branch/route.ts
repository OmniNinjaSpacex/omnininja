import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '#omninininja/db';
import { parseJsonRequest } from '@/lib/http-body';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { selectConversationBranch } from '@/lib/conversation-history';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'conversation-branch', 20, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const parsed = await parseJsonRequest(req, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const messageId = typeof parsed.body.messageId === 'string'
    ? parsed.body.messageId.trim().slice(0, 200)
    : '';
  const { id } = await context.params;

  const source = await db.task.findFirst({
    where: { id, userId: user.id, mode: { in: ['omnininja', 'chat', 'work', 'codex'] } },
    select: {
      id: true,
      projectId: true,
      title: true,
      goal: true,
      mode: true,
      model: true,
      messages: {
        where: { role: { in: ['user', 'assistant'] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          model: true,
          embeddingJson: true,
          attachmentsJson: true,
          createdAt: true,
        },
      },
    },
  });
  if (!source) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const selectedMessages = selectConversationBranch(source.messages, messageId);
  if (!selectedMessages.some((message) => message.role === 'user')) {
    return NextResponse.json({ error: 'Não há conteúdo para ramificar.' }, { status: 409 });
  }

  const branchId = crypto.randomUUID();
  const now = new Date();
  const lastAssistant = selectedMessages.findLast((message) => message.role === 'assistant');
  const branch = await db.task.create({
    data: {
      id: branchId,
      userId: user.id,
      projectId: source.projectId,
      title: `${source.title} — ramificação`.slice(0, 80),
      goal: source.goal,
      mode: source.mode,
      model: source.model,
      status: 'completed',
      summary: lastAssistant?.content.slice(0, 500) || null,
      branchedFromId: source.id,
      startedAt: now,
      finishedAt: now,
      messages: {
        create: selectedMessages.map((message) => ({
          userId: user.id,
          role: message.role,
          content: message.content,
          model: message.model,
          embeddingJson: message.embeddingJson,
          attachmentsJson: message.attachmentsJson,
          createdAt: message.createdAt,
        })),
      },
    },
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

  return NextResponse.json({ conversation: branch }, { status: 201 });
}

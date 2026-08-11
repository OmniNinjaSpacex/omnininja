import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';
import { consumeCredits, CREDIT_COSTS, refundCreditDebit } from '@/lib/credits';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { openAISafetyIdentifier } from '@/lib/openai-safety';
import { parseJsonRequest } from '@/lib/http-body';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

async function markImageTaskFailed(taskId: string, userId: string, summary: string) {
  await db.task.updateMany({
    where: { id: taskId, userId },
    data: { status: 'failed', summary, finishedAt: new Date() },
  }).catch(() => {});
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'image-generation', 8, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const parsedRequest = await parseJsonRequest(req, 16 * 1024);
  if (!parsedRequest.ok) return parsedRequest.response;
  const body = parsedRequest.body;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 5000) : '';
  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 });

  const requestedProjectId = typeof body.projectId === 'string' ? body.projectId.trim().slice(0, 200) : '';
  const project = requestedProjectId
    ? await db.project.findFirst({
        where: { id: requestedProjectId, userId: user.id },
        select: { id: true },
      })
    : null;
  if (requestedProjectId && !project) {
    return Response.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  }

  const debit = await consumeCredits(user.id, CREDIT_COSTS.image_generation, 'image_generation');
  if (!debit.ok) return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });

  const taskId = crypto.randomUUID();
  try {
    await db.$transaction([
      db.task.create({
        data: {
          id: taskId,
          userId: user.id,
          projectId: project?.id,
          title: prompt.slice(0, 80),
          goal: prompt,
          mode: 'omnininja',
          model: 'OMNINJA',
          status: 'running',
          creditsUsed: CREDIT_COSTS.image_generation,
          startedAt: new Date(),
        },
      }),
      db.message.create({
        data: {
          userId: user.id,
          taskId,
          role: 'user',
          content: prompt,
          model: 'OMNINJA',
        },
      }),
      db.creditTransaction.update({
        where: { id: debit.transactionId },
        data: { taskId },
      }),
    ]);
  } catch {
    await refundCreditDebit(
      user.id,
      debit.debit,
      'image_generation_persistence_refund',
    ).catch(() => {});
    return Response.json({ error: 'Não foi possível iniciar a imagem.' }, { status: 500 });
  }

  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${requireOpenAIKey()}`,
      },
      body: JSON.stringify({
        model: OPENAI_SERVICE_MODELS.chat,
        input: `Crie a imagem solicitada pelo usuário. Preserve fielmente a intenção e não adicione texto que não foi pedido.\n\nPedido: ${prompt}`,
        tools: [{ type: 'image_generation', action: 'auto', quality: 'auto', size: 'auto', background: 'auto' }],
        tool_choice: { type: 'image_generation' },
        safety_identifier: openAISafetyIdentifier(user.id),
        store: false,
      }),
      cache: 'no-store',
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(180_000)]),
    });
  } catch (error) {
    console.error('[image] geração falhou', error);
    await Promise.all([
      markImageTaskFailed(taskId, user.id, 'Não foi possível gerar a imagem.'),
      refundCreditDebit(user.id, debit.debit, 'image_generation_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'Não foi possível gerar a imagem.' }, { status: 502 });
  }

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    console.error('[image] mecanismo retornou erro', response.status);
    await Promise.all([
      markImageTaskFailed(taskId, user.id, 'Não foi possível gerar a imagem.'),
      refundCreditDebit(user.id, debit.debit, 'image_generation_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'Não foi possível gerar a imagem.' }, { status: 502 });
  }

  const image = (payload?.output || []).find(
    (item: any) => item?.type === 'image_generation_call' && typeof item?.result === 'string' && item.result,
  );
  if (!image?.result) {
    await Promise.all([
      markImageTaskFailed(taskId, user.id, 'A geração terminou sem uma imagem.'),
      refundCreditDebit(user.id, debit.debit, 'image_generation_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'A geração terminou sem uma imagem.' }, { status: 502 });
  }

  const imageId = typeof image.id === 'string' && image.id ? image.id : crypto.randomUUID();
  try {
    await db.$transaction([
      db.artifact.create({
        data: {
          taskId,
          name: 'Imagem gerada pelo OMNINJA',
          kind: 'openai-image',
          path: imageId,
          sizeBytes: Math.min(2_147_483_647, Math.floor(image.result.length * 0.75)),
        },
      }),
      db.message.create({
        data: {
          userId: user.id,
          taskId,
          role: 'assistant',
          content: 'Imagem gerada pelo OMNINJA.',
          model: 'OMNINJA',
        },
      }),
      db.task.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          summary: 'Imagem gerada pelo OMNINJA.',
          finishedAt: new Date(),
        },
      }),
    ]);
  } catch {
    await Promise.all([
      markImageTaskFailed(taskId, user.id, 'Não foi possível registrar a imagem.'),
      refundCreditDebit(user.id, debit.debit, 'image_generation_persistence_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'Não foi possível registrar a imagem.' }, { status: 500 });
  }

  return Response.json({
    taskId,
    model: 'OMNINJA',
    media: {
      id: imageId,
      kind: 'image',
      mimeType: 'image/png',
      name: 'Imagem gerada pelo OMNINJA',
      url: `data:image/png;base64,${image.result}`,
      status: 'completed',
      progress: 100,
    },
  });
}

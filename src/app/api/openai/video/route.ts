import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';
import { consumeCredits, CREDIT_COSTS, refundCreditDebit } from '@/lib/credits';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { parseJsonRequest } from '@/lib/http-body';
import { db } from '#omninininja/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALLOWED_SECONDS = new Set(['4', '8', '12']);
const ALLOWED_SIZES = new Set(['720x1280', '1280x720', '1024x1792', '1792x1024']);

function validVideoId(value: string | null): value is string {
  return Boolean(value && /^video_[A-Za-z0-9_-]+$/.test(value));
}

async function markVideoTaskFailed(taskId: string, userId: string, summary: string) {
  await db.task.updateMany({
    where: { id: taskId, userId },
    data: { status: 'failed', summary, finishedAt: new Date() },
  }).catch(() => {});
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'video-generation', 3, 60_000, user.id);
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

  const seconds = ALLOWED_SECONDS.has(String(body.seconds)) ? String(body.seconds) : '4';
  const size = ALLOWED_SIZES.has(String(body.size)) ? String(body.size) : '1280x720';

  const form = new FormData();
  form.set('model', OPENAI_SERVICE_MODELS.video);
  form.set('prompt', prompt);
  form.set('seconds', seconds);
  form.set('size', size);

  const debit = await consumeCredits(user.id, CREDIT_COSTS.video_generation, 'video_generation');
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
          model: 'OMNININJA',
          status: 'running',
          creditsUsed: CREDIT_COSTS.video_generation,
          startedAt: new Date(),
        },
      }),
      db.message.create({
        data: {
          userId: user.id,
          taskId,
          role: 'user',
          content: prompt,
          model: 'OMNININJA',
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
      'video_generation_persistence_refund',
    ).catch(() => {});
    return Response.json({ error: 'Não foi possível iniciar o vídeo.' }, { status: 500 });
  }

  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/videos`, {
      method: 'POST',
      headers: { authorization: `Bearer ${requireOpenAIKey()}` },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(120_000)]),
    });
  } catch (error) {
    console.error('[video] criação falhou', error);
    await Promise.all([
      markVideoTaskFailed(taskId, user.id, 'Não foi possível iniciar o vídeo.'),
      refundCreditDebit(user.id, debit.debit, 'video_generation_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'Não foi possível iniciar o vídeo.' }, { status: 502 });
  }

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    console.error('[video] mecanismo retornou erro', response.status);
    await Promise.all([
      markVideoTaskFailed(taskId, user.id, 'Não foi possível iniciar o vídeo.'),
      refundCreditDebit(user.id, debit.debit, 'video_generation_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'Não foi possível iniciar o vídeo.' }, { status: 502 });
  }

  const videoId = typeof payload.id === 'string' ? payload.id : null;
  if (!validVideoId(videoId)) {
    await Promise.all([
      markVideoTaskFailed(taskId, user.id, 'A geração não retornou um identificador válido.'),
      refundCreditDebit(user.id, debit.debit, 'video_generation_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'Não foi possível iniciar o vídeo.' }, { status: 502 });
  }

  const initialStatus = typeof payload.status === 'string' ? payload.status : 'queued';
  const initialCompleted = initialStatus === 'completed';
  const initialFailed = initialStatus === 'failed';

  try {
    await db.$transaction([
      db.artifact.create({
        data: {
          taskId,
          name: 'Vídeo gerado pelo OMNININJA',
          kind: 'openai-video',
          path: videoId,
        },
      }),
      db.message.create({
        data: {
          userId: user.id,
          taskId,
          role: 'assistant',
          content: initialCompleted
            ? 'Vídeo gerado pelo OMNININJA.'
            : initialFailed
              ? 'A geração do vídeo falhou.'
              : 'Vídeo em processamento.',
          model: 'OMNININJA',
        },
      }),
      db.task.update({
        where: { id: taskId },
        data: {
          status: initialCompleted || initialFailed ? initialStatus : 'running',
          summary: initialCompleted
            ? 'Vídeo gerado pelo OMNININJA.'
            : initialFailed
              ? 'A geração do vídeo falhou.'
              : 'Vídeo em processamento.',
          finishedAt: initialCompleted || initialFailed ? new Date() : null,
        },
      }),
    ]);
  } catch {
    await Promise.all([
      markVideoTaskFailed(taskId, user.id, 'Não foi possível registrar o vídeo.'),
      refundCreditDebit(user.id, debit.debit, 'video_generation_persistence_refund', taskId).catch(() => {}),
    ]);
    return Response.json({ error: 'Não foi possível registrar o vídeo.' }, { status: 500 });
  }

  return Response.json({
    id: videoId,
    taskId,
    status: initialStatus,
    progress: payload.progress ?? 0,
    size: payload.size,
    seconds: payload.seconds,
    model: 'OMNININJA',
  });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'video-status', 90, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const url = new URL(req.url);
  const id = url.searchParams.get('id')?.trim() || null;
  if (!validVideoId(id)) {
    return Response.json({ error: 'valid video id required' }, { status: 400 });
  }

  const artifact = await db.artifact.findFirst({
    where: {
      kind: 'openai-video',
      path: id,
      task: { is: { userId: user.id } },
    },
    select: {
      taskId: true,
      task: { select: { status: true } },
    },
  });
  if (!artifact) {
    return Response.json({ error: 'Vídeo não encontrado.' }, { status: 404 });
  }

  try {
    if (url.searchParams.get('content') === '1') {
      if (artifact.task.status !== 'completed') {
        return Response.json({ error: 'Vídeo ainda não disponível.' }, { status: 409 });
      }
      const response = await fetch(`${OPENAI_BASE_URL}/videos/${encodeURIComponent(id)}/content`, {
        headers: { authorization: `Bearer ${requireOpenAIKey()}` },
        cache: 'no-store',
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(120_000)]),
      });

      if (!response.ok || !response.body) {
        console.error('[video] conteúdo indisponível', response.status);
        return Response.json({ error: 'Vídeo ainda não disponível.' }, { status: 502 });
      }

      return new Response(response.body, {
        headers: {
          'content-type': response.headers.get('content-type') || 'video/mp4',
          'cache-control': 'private, no-store',
          'content-disposition': 'inline; filename="omninja-video.mp4"',
        },
      });
    }

    const response = await fetch(`${OPENAI_BASE_URL}/videos/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${requireOpenAIKey()}` },
      cache: 'no-store',
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(30_000)]),
    });

    const payload = await response.json().catch(() => ({} as any));
    if (!response.ok) {
      console.error('[video] consulta falhou', response.status);
      return Response.json({ error: 'Não foi possível consultar o vídeo.' }, { status: 502 });
    }

    const status = typeof payload.status === 'string' ? payload.status : 'in_progress';
    if (status === 'completed' || status === 'failed') {
      const completed = status === 'completed';
      await db.$transaction([
        db.task.updateMany({
          where: { id: artifact.taskId, userId: user.id },
          data: {
            status,
            summary: completed ? 'Vídeo gerado pelo OMNININJA.' : 'A geração do vídeo falhou.',
            finishedAt: new Date(),
          },
        }),
        db.message.updateMany({
          where: { taskId: artifact.taskId, userId: user.id, role: 'assistant' },
          data: { content: completed ? 'Vídeo gerado pelo OMNININJA.' : 'A geração do vídeo falhou.' },
        }),
      ]);
    }

    return Response.json({
      id: payload.id,
      status,
      progress: payload.progress ?? 0,
      size: payload.size,
      seconds: payload.seconds,
      model: 'OMNININJA',
    });
  } catch (error) {
    console.error('[video] consulta indisponível', error);
    return Response.json({ error: 'Não foi possível consultar o vídeo.' }, { status: 502 });
  }
}

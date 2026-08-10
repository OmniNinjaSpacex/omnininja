import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALLOWED_SECONDS = new Set(['4', '8', '12']);
const ALLOWED_SIZES = new Set(['720x1280', '1280x720', '1024x1792', '1792x1024']);

function validVideoId(value: string | null): value is string {
  return Boolean(value && /^video_[A-Za-z0-9_-]+$/.test(value));
}

export async function POST(req: Request) {
  await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 5000) : '';
  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 });

  const seconds = ALLOWED_SECONDS.has(String(body.seconds)) ? String(body.seconds) : '4';
  const size = ALLOWED_SIZES.has(String(body.size)) ? String(body.size) : '1280x720';

  const form = new FormData();
  form.set('model', OPENAI_SERVICE_MODELS.video);
  form.set('prompt', prompt);
  form.set('seconds', seconds);
  form.set('size', size);

  const response = await fetch(`${OPENAI_BASE_URL}/videos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${requireOpenAIKey()}` },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    return Response.json({ error: payload?.error?.message || 'Falha ao criar vídeo' }, { status: 502 });
  }

  return Response.json({
    id: payload.id,
    status: payload.status,
    progress: payload.progress ?? 0,
    size: payload.size,
    seconds: payload.seconds,
    model: 'OMNINJA',
  });
}

export async function GET(req: Request) {
  await getCurrentUser();
  const url = new URL(req.url);
  const id = url.searchParams.get('id')?.trim() || null;
  if (!validVideoId(id)) {
    return Response.json({ error: 'valid video id required' }, { status: 400 });
  }

  if (url.searchParams.get('content') === '1') {
    const response = await fetch(`${OPENAI_BASE_URL}/videos/${encodeURIComponent(id)}/content`, {
      headers: { authorization: `Bearer ${requireOpenAIKey()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      return Response.json({ error: detail.slice(0, 500) || 'Vídeo ainda não disponível' }, { status: 502 });
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
    signal: AbortSignal.timeout(30_000),
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    return Response.json({ error: payload?.error?.message || 'Falha ao consultar vídeo' }, { status: 502 });
  }

  return Response.json({
    id: payload.id,
    status: payload.status,
    progress: payload.progress ?? 0,
    size: payload.size,
    seconds: payload.seconds,
    model: 'OMNINJA',
  });
}

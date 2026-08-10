import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  await getCurrentUser();
  const incoming = await req.formData();
  const file = incoming.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return Response.json({ error: 'audio file required' }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return Response.json({ error: 'Arquivo de áudio muito grande.' }, { status: 413 });
  }

  const form = new FormData();
  form.set('file', file, file.name || 'audio.webm');
  form.set('model', OPENAI_SERVICE_MODELS.transcription);
  form.set('response_format', 'json');

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${requireOpenAIKey()}` },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    return Response.json({ error: payload?.error?.message || 'Falha ao transcrever áudio' }, { status: 502 });
  }

  return Response.json({ text: String(payload?.text || ''), model: 'OMNINJA' });
}

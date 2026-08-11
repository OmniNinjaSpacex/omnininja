import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';
import { consumeCredits, CREDIT_COSTS, refundCreditDebit } from '@/lib/credits';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'transcription', 20, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 26 * 1024 * 1024) {
    return Response.json({ error: 'Arquivo de áudio muito grande.' }, { status: 413 });
  }

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return Response.json({ error: 'Formulário de áudio inválido.' }, { status: 400 });
  }
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

  const debit = await consumeCredits(user.id, CREDIT_COSTS.transcription, 'transcription');
  if (!debit.ok) return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });

  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${requireOpenAIKey()}` },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(120_000)]),
    });
  } catch (error) {
    console.error('[transcription] solicitação falhou', error);
    await refundCreditDebit(user.id, debit.debit, 'transcription_refund').catch(() => {});
    return Response.json({ error: 'Não foi possível transcrever o áudio.' }, { status: 502 });
  }

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    console.error('[transcription] mecanismo retornou erro', response.status);
    await refundCreditDebit(user.id, debit.debit, 'transcription_refund').catch(() => {});
    return Response.json({ error: 'Não foi possível transcrever o áudio.' }, { status: 502 });
  }

  return Response.json({ text: String(payload?.text || ''), model: 'OMNININJA' });
}

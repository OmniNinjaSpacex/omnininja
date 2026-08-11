import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';
import { consumeCredits, CREDIT_COSTS, refundCreditDebit } from '@/lib/credits';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { parseJsonRequest } from '@/lib/http-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'speech', 20, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const parsedRequest = await parseJsonRequest(req, 16 * 1024);
  if (!parsedRequest.ok) return parsedRequest.response;
  const body = parsedRequest.body;
  const input = typeof body.input === 'string' ? body.input.trim().slice(0, 4096) : '';
  const allowedVoices = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse']);
  const voice = typeof body.voice === 'string' && allowedVoices.has(body.voice) ? body.voice : 'marin';

  if (!input) return Response.json({ error: 'input required' }, { status: 400 });

  const debit = await consumeCredits(user.id, CREDIT_COSTS.speech, 'speech');
  if (!debit.ok) return Response.json({ error: 'Créditos insuficientes' }, { status: 402 });

  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${requireOpenAIKey()}`,
      },
      body: JSON.stringify({
        model: OPENAI_SERVICE_MODELS.speech,
        voice,
        input,
        response_format: 'mp3',
        instructions: 'Fale em português brasileiro de forma natural e clara.',
      }),
      cache: 'no-store',
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(90_000)]),
    });
  } catch (error) {
    console.error('[speech] solicitação falhou', error);
    await refundCreditDebit(user.id, debit.debit, 'speech_refund').catch(() => {});
    return Response.json({ error: 'Não foi possível gerar o áudio.' }, { status: 502 });
  }

  if (!response.ok) {
    console.error('[speech] mecanismo retornou erro', response.status);
    await refundCreditDebit(user.id, debit.debit, 'speech_refund').catch(() => {});
    return Response.json({ error: 'Não foi possível gerar o áudio.' }, { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      'content-type': response.headers.get('content-type') || 'audio/mpeg',
      'cache-control': 'no-store',
    },
  });
}

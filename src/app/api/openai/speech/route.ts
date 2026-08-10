import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const input = typeof body.input === 'string' ? body.input.trim().slice(0, 4096) : '';
  const voice = typeof body.voice === 'string' ? body.voice : 'marin';

  if (!input) return Response.json({ error: 'input required' }, { status: 400 });

  const response = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
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
      instructions: 'Fale em português brasileiro de forma natural, clara e amigável.',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return Response.json({ error: detail.slice(0, 500) || 'Falha ao gerar áudio' }, { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      'content-type': response.headers.get('content-type') || 'audio/mpeg',
      'cache-control': 'no-store',
    },
  });
}

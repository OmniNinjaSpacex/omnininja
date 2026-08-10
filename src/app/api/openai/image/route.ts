import { getCurrentUser } from '@/lib/auth';
import { OPENAI_BASE_URL, OPENAI_SERVICE_MODELS, requireOpenAIKey } from '@/lib/openai-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: Request) {
  await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 5000) : '';
  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 });

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
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
      store: false,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(180_000),
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    return Response.json({ error: payload?.error?.message || 'Falha ao gerar imagem' }, { status: 502 });
  }

  const image = (payload?.output || []).find(
    (item: any) => item?.type === 'image_generation_call' && typeof item?.result === 'string' && item.result,
  );
  if (!image?.result) {
    return Response.json({ error: 'A geração terminou sem uma imagem.' }, { status: 502 });
  }

  return Response.json({
    model: 'OMNINJA',
    media: {
      id: image.id || crypto.randomUUID(),
      kind: 'image',
      mimeType: 'image/png',
      name: 'Imagem gerada pelo OMNINJA',
      url: `data:image/png;base64,${image.result}`,
      status: 'completed',
      progress: 100,
    },
  });
}

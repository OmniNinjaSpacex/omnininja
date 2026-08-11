import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { OPENAI_BASE_URL, requireOpenAIKey } from '@/lib/openai-services';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const SAFE_OPENAI_ID = /^[A-Za-z0-9_-]{3,200}$/;

function contentTypeFor(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop();
  const types: Record<string, string> = {
    csv: 'text/csv; charset=utf-8',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    html: 'text/html; charset=utf-8',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    pdf: 'application/pdf',
    png: 'image/png',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain; charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
  };
  return types[extension || ''] || 'application/octet-stream';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(request, 'artifact-download', 30, 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const { id } = await context.params;
  const artifact = await db.artifact.findFirst({
    where: { id, task: { userId: user.id } },
    select: { id: true, name: true, kind: true, path: true },
  });
  if (!artifact || artifact.kind !== 'file') {
    return Response.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  let reference: { provider?: string; containerId?: string; fileId?: string };
  try {
    reference = JSON.parse(artifact.path);
  } catch {
    return Response.json({ error: 'Referência de arquivo inválida.' }, { status: 410 });
  }

  const containerId = String(reference.containerId || '');
  const fileId = String(reference.fileId || '');
  if (
    reference.provider !== 'openai-container' ||
    !SAFE_OPENAI_ID.test(containerId) ||
    !SAFE_OPENAI_ID.test(fileId)
  ) {
    return Response.json({ error: 'Referência de arquivo inválida.' }, { status: 410 });
  }

  const upstream = await fetch(
    `${OPENAI_BASE_URL}/containers/${encodeURIComponent(containerId)}/files/${encodeURIComponent(fileId)}/content`,
    {
      headers: { authorization: `Bearer ${requireOpenAIKey()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const expired = upstream.status === 404 || upstream.status === 410;
    return Response.json(
      { error: expired ? 'Este arquivo temporário expirou.' : 'Não foi possível baixar o arquivo.' },
      { status: expired ? 410 : 502 },
    );
  }

  const safeName = artifact.name.replace(/[\r\n"\\]/g, '_').slice(0, 240) || 'arquivo';
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'content-type': upstream.headers.get('content-type') || contentTypeFor(safeName),
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    'x-content-type-options': 'nosniff',
  });
  const length = upstream.headers.get('content-length');
  if (length && /^\d+$/.test(length)) headers.set('content-length', length);

  return new Response(upstream.body, { status: 200, headers });
}

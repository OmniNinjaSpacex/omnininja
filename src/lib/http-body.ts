export type ParsedJsonRequest =
  | { ok: true; body: Record<string, any> }
  | { ok: false; response: Response };

export async function parseJsonRequest(
  request: Request,
  maxBytes: number,
): Promise<ParsedJsonRequest> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      response: Response.json({ error: 'Solicitação muito grande.' }, { status: 413 }),
    };
  }

  if (!request.body) return { ok: true, body: {} };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          response: Response.json({ error: 'Solicitação muito grande.' }, { status: 413 }),
        };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    if (!raw.trim()) return { ok: true, body: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ok: true, body: parsed as Record<string, any> }
      : { ok: false, response: Response.json({ error: 'JSON inválido.' }, { status: 400 }) };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'JSON inválido.' }, { status: 400 }),
    };
  } finally {
    reader.releaseLock();
  }
}

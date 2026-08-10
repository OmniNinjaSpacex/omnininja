// OmniNinja — Browserless interactive takeover session endpoint
// POST { initialUrl?, timeoutMs? } -> { liveURL, browserWSEndpoint, expiresInMs }
// The Browserless token never leaves the server.

import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function browserlessToken(): string {
  const token = process.env.BROWSERLESS_API_KEY?.trim();
  if (!token) throw new Error('BROWSERLESS_API_KEY nao configurada no servidor');
  return token;
}

function timeoutFor(requested?: number): number {
  const configured = Number(process.env.BROWSERLESS_RECONNECT_TIMEOUT_MS || 10000);
  const base = Number.isFinite(requested) && Number(requested) > 0 ? Number(requested) : configured;
  return Math.max(5000, Math.min(base, 300000));
}

export async function POST(req: Request) {
  await getCurrentUser();

  const body = await req.json().catch(() => ({} as any));
  const initialUrl = typeof body.initialUrl === 'string' && body.initialUrl.trim()
    ? body.initialUrl.trim()
    : 'https://www.google.com/';

  let parsed: URL;
  try {
    parsed = new URL(initialUrl);
  } catch {
    return Response.json({ error: 'initialUrl invalida' }, { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Response.json({ error: 'initialUrl precisa usar http ou https' }, { status: 400 });
  }

  const timeoutMs = timeoutFor(Number(body.timeoutMs));
  const token = browserlessToken();
  const region = process.env.BROWSERLESS_REGION || 'production-sfo';
  const endpoint = `https://${region}.browserless.io/stealth/bql?token=${encodeURIComponent(token)}`;

  const query = `
    mutation StartOmniNinjaTakeover($url: String!, $timeout: Float!) {
      goto(url: $url, waitUntil: domContentLoaded) { status }
      liveURL(timeout: $timeout, interactable: true, resizable: true, showBrowserInterface: true) { liveURL }
      reconnect(timeout: $timeout) { browserQLEndpoint browserWSEndpoint }
    }
  `;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { url: parsed.toString(), timeout: timeoutMs },
        operationName: 'StartOmniNinjaTakeover',
      }),
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({} as any));
    if (!response.ok || payload?.errors?.length) {
      const detail = payload?.errors?.[0]?.message || `HTTP ${response.status}`;
      return Response.json({ error: `Browserless: ${detail}` }, { status: 502 });
    }

    const liveURL = payload?.data?.liveURL?.liveURL;
    const browserWSEndpoint = payload?.data?.reconnect?.browserWSEndpoint;

    if (!liveURL || !browserWSEndpoint) {
      return Response.json({ error: 'Browserless nao retornou liveURL/browserWSEndpoint' }, { status: 502 });
    }

    return Response.json({
      liveURL,
      browserWSEndpoint,
      expiresInMs: timeoutMs,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Browserless session error' }, { status: 500 });
  }
}

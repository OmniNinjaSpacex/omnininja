// OmniNinja — Browserless interactive takeover session endpoint
// POST { initialUrl?, timeoutMs? } -> liveURL + reconnect endpoint.
// The Browserless API token remains server-side.

import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function requireBrowserlessToken(): string {
  const token = process.env.BROWSERLESS_API_KEY?.trim();
  if (!token) throw new Error('BROWSERLESS_API_KEY nao configurada no servidor');
  return token;
}

function resolveTimeout(requested: unknown): number {
  const configured = Number(process.env.BROWSERLESS_RECONNECT_TIMEOUT_MS || 10000);
  const requestedNumber = Number(requested);
  const value = Number.isFinite(requestedNumber) && requestedNumber > 0
    ? requestedNumber
    : configured;
  return Math.max(5000, Math.min(value, 300000));
}

export async function POST(req: Request) {
  await getCurrentUser();
  const body = await req.json().catch(() => ({} as any));
  const rawInitialUrl = typeof body.initialUrl === 'string' && body.initialUrl.trim()
    ? body.initialUrl.trim()
    : 'https://www.google.com/';

  let initialUrl: URL;
  try {
    initialUrl = new URL(rawInitialUrl);
  } catch {
    return Response.json({ error: 'initialUrl invalida' }, { status: 400 });
  }

  if (initialUrl.protocol !== 'http:' && initialUrl.protocol !== 'https:') {
    return Response.json({ error: 'initialUrl precisa usar http ou https' }, { status: 400 });
  }

  const token = requireBrowserlessToken();
  const region = process.env.BROWSERLESS_REGION || 'production-sfo';
  const timeoutMs = resolveTimeout(body.timeoutMs);
  const endpoint = `https://${region}.browserless.io/stealth/bql?token=${encodeURIComponent(token)}`;

  const query = `
    mutation StartOmniNinjaTakeover($url: String!, $timeout: Float!) {
      goto(url: $url, waitUntil: domContentLoaded) { status }
      liveURL(
        timeout: $timeout,
        interactable: true,
        resizable: true,
        showBrowserInterface: true
      ) { liveURL }
      reconnect(timeout: $timeout) {
        browserQLEndpoint
        browserWSEndpoint
      }
    }
  `;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        operationName: 'StartOmniNinjaTakeover',
        variables: { url: initialUrl.toString(), timeout: timeoutMs },
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
      return Response.json(
        { error: 'Browserless nao retornou liveURL/browserWSEndpoint' },
        { status: 502 },
      );
    }

    return Response.json({ liveURL, browserWSEndpoint, expiresInMs: timeoutMs });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Falha ao criar sessao Browserless' },
      { status: 500 },
    );
  }
}

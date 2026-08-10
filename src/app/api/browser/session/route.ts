// OmniNinja — Browserless interactive takeover session endpoint
// POST { initialUrl?, timeoutMs? } -> liveURL + reconnect endpoint.
// The Browserless API token remains server-side.

import { getCurrentUser } from '@/lib/auth';
import { createInteractiveBrowserSession } from '@/lib/browser-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const requestedTimeout = Number(body.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? requestedTimeout
    : Number(process.env.BROWSERLESS_SESSION_TIMEOUT_MS || 10 * 60 * 1000);

  try {
    const session = await createInteractiveBrowserSession(parsed.toString(), timeoutMs);
    return Response.json({
      liveURL: session.liveURL,
      browserWSEndpoint: session.browserWSEndpoint,
      browserQLEndpoint: session.browserQLEndpoint,
      expiresInMs: session.expiresInMs,
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Browserless session error' },
      { status: 502 },
    );
  }
}

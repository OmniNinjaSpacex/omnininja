// OmniNinja — secure Browserless human-takeover session endpoint.
// POST { initialUrl?, timeoutMs? } -> liveURL + signed browserSessionTicket.
// Raw Browserless reconnect endpoints and API tokens never leave the server.

import { getCurrentUser } from '@/lib/auth';
import { createInteractiveBrowserSession } from '@/lib/browser-agent';
import { createBrowserSessionTicket } from '@/lib/browser-session-ticket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function resolveTimeout(requested: unknown): number {
  const configured = Number(process.env.BROWSERLESS_RECONNECT_TIMEOUT_MS || 10 * 60 * 1000);
  const requestedNumber = Number(requested);
  const value = Number.isFinite(requestedNumber) && requestedNumber > 0
    ? requestedNumber
    : configured;
  return Math.max(60_000, Math.min(value, 30 * 60 * 1000));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();

  if (!process.env.BROWSERLESS_API_KEY?.trim()) {
    return Response.json(
      { error: 'Browser cloud indisponível: BROWSERLESS_API_KEY não configurada.' },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const rawInitialUrl = typeof body.initialUrl === 'string' && body.initialUrl.trim()
    ? body.initialUrl.trim()
    : 'https://www.google.com/';

  let initialUrl: URL;
  try {
    initialUrl = new URL(rawInitialUrl);
  } catch {
    return Response.json({ error: 'initialUrl inválida' }, { status: 400 });
  }

  if (initialUrl.protocol !== 'http:' && initialUrl.protocol !== 'https:') {
    return Response.json({ error: 'initialUrl precisa usar http ou https' }, { status: 400 });
  }

  const timeoutMs = resolveTimeout(body.timeoutMs);

  try {
    const session = await createInteractiveBrowserSession(initialUrl.toString(), timeoutMs);
    const browserSessionTicket = createBrowserSessionTicket({
      userId: user.id,
      browserWSEndpoint: session.browserWSEndpoint,
      expiresInMs: session.expiresInMs,
    });

    return Response.json({
      liveURL: session.liveURL,
      browserSessionTicket,
      expiresInMs: session.expiresInMs,
    });
  } catch (error: any) {
    const message = error?.message || 'Falha ao criar sessão Browserless';
    const configError =
      message.includes('SIGNING_SECRET') ||
      message.includes('NEXTAUTH_SECRET') ||
      message.includes('BROWSERLESS_API_KEY');

    return Response.json(
      { error: message },
      { status: configError ? 503 : 502 },
    );
  }
}

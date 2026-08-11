import { NextResponse } from 'next/server';
import { beginOAuth, OAuthFlowError } from '@/lib/oauth';
import {
  oauthStateCookieName,
  parseOAuthProvider,
} from '@/lib/oauth-config';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const provider = parseOAuthProvider((await context.params).provider);
  if (!provider) return NextResponse.json({ error: 'Provedor inválido.' }, { status: 404 });

  const rateLimit = checkRateLimit(
    request,
    `oauth-start-${provider}`,
    20,
    10 * 60_000,
  );
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  try {
    const returnTo = new URL(request.url).searchParams.get('returnTo');
    const flow = await beginOAuth(provider, returnTo);
    const response = NextResponse.redirect(flow.authorizationUrl);
    response.cookies.set(oauthStateCookieName(provider), flow.state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: flow.expiresAt,
    });
    response.headers.set('cache-control', 'no-store');
    response.headers.set('referrer-policy', 'no-referrer');
    return response;
  } catch (error) {
    const status = error instanceof OAuthFlowError && error.code === 'not_configured'
      ? 404
      : 503;
    return NextResponse.json(
      { error: 'Login social indisponível.' },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  }
}

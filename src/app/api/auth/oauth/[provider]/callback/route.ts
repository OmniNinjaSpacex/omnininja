import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  cancelOAuth,
  completeOAuth,
  OAuthFlowError,
  type OAuthErrorCode,
} from '@/lib/oauth';
import {
  oauthAppBaseUrl,
  oauthStateCookieName,
  parseOAuthProvider,
  safeOAuthReturnTo,
} from '@/lib/oauth-config';

export const dynamic = 'force-dynamic';

const PUBLIC_ERROR_CODES = new Set<OAuthErrorCode>([
  'account_exists',
  'cancelled',
  'invalid_profile',
  'invalid_state',
  'not_configured',
  'provider_error',
]);

function redirectResponse(path: string) {
  return NextResponse.redirect(new URL(path, oauthAppBaseUrl()));
}

function errorRedirect(code: OAuthErrorCode) {
  const url = new URL('/login', oauthAppBaseUrl());
  url.searchParams.set('oauth_error', code);
  return NextResponse.redirect(url);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const provider = parseOAuthProvider((await context.params).provider);
  if (!provider) return NextResponse.json({ error: 'Provedor inválido.' }, { status: 404 });

  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get('state') || '';
  const cookieName = oauthStateCookieName(provider);
  const cookieState = (await cookies()).get(cookieName)?.value || '';
  let response: NextResponse;

  try {
    if (requestUrl.searchParams.has('error')) {
      await cancelOAuth(provider, state, cookieState);
      response = errorRedirect('cancelled');
    } else {
      const code = requestUrl.searchParams.get('code') || '';
      const result = await completeOAuth(provider, code, state, cookieState);
      response = redirectResponse(safeOAuthReturnTo(result.returnTo));
    }
  } catch (error) {
    const code = error instanceof OAuthFlowError && PUBLIC_ERROR_CODES.has(error.code)
      ? error.code
      : 'provider_error';
    response = errorRedirect(code);
  }

  response.cookies.set(cookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

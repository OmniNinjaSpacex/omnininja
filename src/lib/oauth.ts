import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db } from '#omninininja/db';
import { createSession } from '@/lib/auth';
import {
  oauthCallbackUrl,
  oauthPkceChallenge,
  oauthProviderCredentials,
  randomOAuthToken,
  safeOAuthReturnTo,
  type OAuthProvider,
} from '@/lib/oauth-config';

const OAUTH_STATE_TTL_MS = 10 * 60_000;
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

type OAuthProfile = {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string | null;
  image: string | null;
};

export type OAuthErrorCode =
  | 'account_exists'
  | 'cancelled'
  | 'invalid_profile'
  | 'invalid_state'
  | 'not_configured'
  | 'provider_error';

export class OAuthFlowError extends Error {
  constructor(public readonly code: OAuthErrorCode) {
    super(code);
    this.name = 'OAuthFlowError';
  }
}

function requireProvider(provider: OAuthProvider) {
  const credentials = oauthProviderCredentials(provider);
  if (!credentials.configured) throw new OAuthFlowError('not_configured');
  return credentials;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function normalizedEmail(value: unknown): string | null {
  const email = cleanText(value, 320)?.toLowerCase() || '';
  if (!email || !email.includes('@') || /[\s\u0000-\u001f]/.test(email)) return null;
  return email;
}

function safeImageUrl(value: unknown): string | null {
  const candidate = cleanText(value, 2_048);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function providerJson<T>(url: string | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new OAuthFlowError('provider_error');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new OAuthFlowError('provider_error');
  }
  return payload as T;
}

export async function beginOAuth(
  provider: OAuthProvider,
  requestedReturnTo?: string | null,
) {
  const credentials = requireProvider(provider);
  const state = randomOAuthToken();
  const codeVerifier = randomOAuthToken(64);
  const nonce = randomOAuthToken();
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

  await db.oAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => {});
  await db.oAuthState.create({
    data: {
      id: state,
      provider,
      codeVerifier,
      nonce,
      returnTo: safeOAuthReturnTo(requestedReturnTo),
      expiresAt,
    },
  });

  const redirectUri = oauthCallbackUrl(provider);
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.searchParams.set('client_id', credentials.clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'openid email profile');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('nonce', nonce);
  authorizationUrl.searchParams.set(
    'code_challenge',
    await oauthPkceChallenge(codeVerifier),
  );
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('prompt', 'select_account');

  return { authorizationUrl, state, expiresAt };
}

async function consumeOAuthState(
  provider: OAuthProvider,
  state: string,
  cookieState: string,
) {
  if (
    !state ||
    state.length > 256 ||
    !cookieState ||
    state !== cookieState
  ) {
    throw new OAuthFlowError('invalid_state');
  }

  const record = await db.oAuthState.findUnique({ where: { id: state } });
  if (!record || record.provider !== provider) {
    throw new OAuthFlowError('invalid_state');
  }
  if (record.expiresAt <= new Date()) {
    await db.oAuthState.delete({ where: { id: state } }).catch(() => {});
    throw new OAuthFlowError('invalid_state');
  }

  try {
    await db.oAuthState.delete({ where: { id: state } });
  } catch {
    throw new OAuthFlowError('invalid_state');
  }
  return record;
}

export async function cancelOAuth(
  provider: OAuthProvider,
  state: string,
  cookieState: string,
): Promise<void> {
  await consumeOAuthState(provider, state, cookieState);
}

async function googleProfile(
  code: string,
  codeVerifier: string,
  nonce: string | null,
): Promise<OAuthProfile> {
  const credentials = requireProvider('google');
  const token = await providerJson<{ id_token?: string }>(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: oauthCallbackUrl('google'),
      }),
    },
  );
  if (!token.id_token || !nonce) throw new OAuthFlowError('provider_error');

  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
  try {
    ({ payload } = await jwtVerify(token.id_token, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: credentials.clientId,
    }));
  } catch {
    throw new OAuthFlowError('provider_error');
  }

  const providerAccountId = cleanText(payload.sub, 255);
  const email = normalizedEmail(payload.email);
  if (
    !providerAccountId ||
    !email ||
    payload.email_verified !== true ||
    payload.nonce !== nonce
  ) {
    throw new OAuthFlowError('invalid_profile');
  }

  return {
    provider: 'google',
    providerAccountId,
    email,
    name: cleanText(payload.name, 80),
    image: safeImageUrl(payload.picture),
  };
}

async function sessionForOAuthProfile(profile: OAuthProfile) {
  const account = await db.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (account) {
    const updates = {
      ...(!account.user.name && profile.name ? { name: profile.name } : {}),
      ...(!account.user.image && profile.image ? { image: profile.image } : {}),
    };
    const user = Object.keys(updates).length
      ? await db.user.update({ where: { id: account.userId }, data: updates })
      : account.user;
    await createSession(user.id);
    return user;
  }

  const emailOwner = await db.user.findUnique({ where: { email: profile.email } });
  if (emailOwner) throw new OAuthFlowError('account_exists');

  try {
    const user = await db.user.create({
      data: {
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        image: profile.image,
        passwordHash: null,
        tier: 'free',
        credits: 300,
        bonusCredits: 0,
        role: 'user',
        defaultModel: 'OMNININJA',
        oauthAccounts: {
          create: {
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
          },
        },
      },
    });
    await createSession(user.id);
    return user;
  } catch {
    const racedAccount = await db.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });
    if (!racedAccount) throw new OAuthFlowError('account_exists');
    await createSession(racedAccount.user.id);
    return racedAccount.user;
  }
}

export async function completeOAuth(
  provider: OAuthProvider,
  code: string,
  state: string,
  cookieState: string,
) {
  if (!code || code.length > 4_096) throw new OAuthFlowError('provider_error');
  const oauthState = await consumeOAuthState(provider, state, cookieState);
  const profile = await googleProfile(code, oauthState.codeVerifier, oauthState.nonce);
  const user = await sessionForOAuthProfile(profile);
  return { user, returnTo: safeOAuthReturnTo(oauthState.returnTo) };
}

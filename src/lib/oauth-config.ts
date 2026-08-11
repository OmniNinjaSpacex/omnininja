export const OAUTH_PROVIDERS = ['google'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

const PROVIDER_METADATA: Record<
  OAuthProvider,
  { label: string; clientIdEnv: string; clientSecretEnv: string }
> = {
  google: {
    label: 'Google',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  },
};

export function parseOAuthProvider(value: string): OAuthProvider | null {
  return OAUTH_PROVIDERS.includes(value as OAuthProvider)
    ? (value as OAuthProvider)
    : null;
}

export function oauthProviderCredentials(provider: OAuthProvider) {
  const metadata = PROVIDER_METADATA[provider];
  const clientId = (process.env[metadata.clientIdEnv] || '').trim();
  const clientSecret = (process.env[metadata.clientSecretEnv] || '').trim();
  return {
    id: provider,
    label: metadata.label,
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
  };
}

export function configuredOAuthProviders() {
  return OAUTH_PROVIDERS.map(oauthProviderCredentials)
    .filter((provider) => provider.configured)
    .map(({ id, label }) => ({ id, label }));
}

export function oauthAppBaseUrl(): string {
  const configured = (
    process.env.OMNININJA_PUBLIC_BASE ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).trim();

  if (!configured && process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }
  if (!configured) throw new Error('URL pública do OMNININJA não configurada');

  const parsed = new URL(configured);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('URL pública do OMNININJA inválida');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('URL pública do OMNININJA precisa usar HTTPS');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL pública do OMNININJA inválida');
  }
  return parsed.origin;
}

export function oauthCallbackUrl(provider: OAuthProvider): string {
  return new URL(
    `/api/auth/oauth/${provider}/callback`,
    oauthAppBaseUrl(),
  ).toString();
}

export function oauthStateCookieName(provider: OAuthProvider): string {
  return `omninja_oauth_${provider}_state`;
}

export function safeOAuthReturnTo(value: string | null | undefined): string {
  const candidate = String(value || '/').trim();
  if (
    candidate.length > 2_048 ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return '/';
  }

  try {
    const parsed = new URL(candidate, 'https://omnininja.invalid');
    if (parsed.origin !== 'https://omnininja.invalid') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function randomOAuthToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export async function oauthPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

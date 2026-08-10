// OmniNinja — signed Browserless takeover tickets.
// The browser reconnect endpoint never needs to be trusted from the client.
// Tickets are bound to one OmniNinja user and expire with the Browserless
// session. The Browserless API token is never included in the ticket.

import crypto from 'node:crypto';

interface BrowserSessionTicketPayload {
  v: 1;
  userId: string;
  browserWSEndpoint: string;
  exp: number;
}

function signingSecret(): string {
  const secret =
    process.env.BROWSER_SESSION_SIGNING_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error(
      'BROWSER_SESSION_SIGNING_SECRET (ou NEXTAUTH_SECRET) precisa ter pelo menos 32 caracteres',
    );
  }
  return secret;
}

function sign(encodedPayload: string): Buffer {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(encodedPayload)
    .digest();
}

export function createBrowserSessionTicket(options: {
  userId: string;
  browserWSEndpoint: string;
  expiresInMs: number;
}): string {
  const expiresInMs = Math.max(5_000, Math.min(options.expiresInMs, 30 * 60 * 1000));
  const payload: BrowserSessionTicketPayload = {
    v: 1,
    userId: options.userId,
    browserWSEndpoint: options.browserWSEndpoint,
    exp: Date.now() + expiresInMs,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = sign(encodedPayload).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyBrowserSessionTicket(ticket: string, expectedUserId: string): {
  browserWSEndpoint: string;
  expiresAt: number;
} {
  if (!ticket || ticket.length > 16_384) {
    throw new Error('browserSessionTicket inválido');
  }

  const parts = ticket.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('browserSessionTicket inválido');
  }

  const [encodedPayload, encodedSignature] = parts;
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    throw new Error('browserSessionTicket inválido');
  }

  const expectedSignature = sign(encodedPayload);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new Error('browserSessionTicket com assinatura inválida');
  }

  let payload: BrowserSessionTicketPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
  } catch {
    throw new Error('browserSessionTicket inválido');
  }

  if (
    payload?.v !== 1 ||
    typeof payload.userId !== 'string' ||
    typeof payload.browserWSEndpoint !== 'string' ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp)
  ) {
    throw new Error('browserSessionTicket inválido');
  }

  if (payload.userId !== expectedUserId) {
    throw new Error('browserSessionTicket pertence a outro usuário');
  }

  if (payload.exp <= Date.now()) {
    throw new Error('browserSessionTicket expirado');
  }

  return {
    browserWSEndpoint: payload.browserWSEndpoint,
    expiresAt: payload.exp,
  };
}

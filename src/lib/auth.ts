// OmniNinja — production auth (email/password + isolated guest sessions)
import { db } from './db';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { promisify } from 'util';

export const SESSION_COOKIE = 'omninja_session';
const SESSION_TTL_DAYS = 30;
const scryptAsync = promisify(crypto.scrypt);

export function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  const hash = Buffer.from(derived as ArrayBuffer).toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  try {
    const expected = Buffer.from(hash, 'hex');
    const actual = Buffer.from(await scryptAsync(password, salt, expected.length) as ArrayBuffer);
    if (expected.length === 0 || actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Returns the authenticated user. For a visitor without an account/session,
 * create a unique low-privilege guest account and its own session.
 *
 * IMPORTANT: never fall back to "the first user" or a shared demo admin. That
 * would expose one customer's data to another visitor.
 */
export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (token) {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (session && session.expiresAt > new Date()) return session.user;

    if (session) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
    }
  }

  return createGuestUser();
}

async function createGuestUser() {
  const suffix = crypto.randomBytes(12).toString('hex');
  const guest = await db.user.create({
    data: {
      email: `guest-${suffix}@guest.omnininja.local`,
      name: 'Guest',
      passwordHash: await hashPassword(randomToken()),
      tier: 'free',
      credits: 50,
      bonusCredits: 0,
      role: 'user',
      defaultModel: 'OMNINJA',
    },
  });

  await createSession(guest.id);
  return guest;
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (previousToken) {
    await db.session.deleteMany({ where: { token: previousToken } }).catch(() => {});
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({ data: { userId, token, expiresAt } });
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return token;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => {});
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function registerUser(email: string, password: string, name?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 320 || !normalizedEmail.includes('@')) {
    return { ok: false, error: 'E-mail inválido' };
  }
  if (password.length < 8 || password.length > 256) {
    return { ok: false, error: 'A senha precisa ter entre 8 e 256 caracteres' };
  }

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return { ok: false, error: 'E-mail já cadastrado' };

  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      name: name?.trim() || normalizedEmail.split('@')[0],
      passwordHash: await hashPassword(password),
      tier: 'free',
      credits: 300,
      bonusCredits: 0,
      role: 'user',
      defaultModel: 'OMNINJA',
    },
  });

  await createSession(user.id);
  return { ok: true, user };
}

export async function loginUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 320 || password.length > 256) {
    return { ok: false, error: 'E-mail ou senha inválidos' };
  }
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: 'E-mail ou senha inválidos' };
  }

  await createSession(user.id);
  return { ok: true, user };
}

export async function logoutUser() {
  await destroySession();
  return { ok: true };
}

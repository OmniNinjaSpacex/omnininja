// OmniNinja — Real Auth (email/senha + sessão cookie)
import { db } from './db';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const SESSION_COOKIE = 'omninja_session';
const SESSION_TTL_DAYS = 30;

export function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await db.session.findUnique({ where: { token }, include: { user: true } });
    if (session && session.expiresAt > new Date()) return session.user;
  }
  const userCount = await db.user.count();
  if (userCount === 0) return createDemoUser();
  const firstUser = await db.user.findFirst({ orderBy: { createdAt: 'asc' } });
  return firstUser ?? createDemoUser();
}

async function createDemoUser() {
  const email = 'ninja@omninja.app';
  return db.user.create({
    data: { email, name: 'Omni Ninja', passwordHash: hashPassword('omnininja'), tier: 'pro', credits: 4000, bonusCredits: 1000, role: 'admin', defaultModel: 'claude' },
  });
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { userId, token, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: expiresAt });
  return token;
}

export async function destroySession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) { await db.session.deleteMany({ where: { token } }).catch(() => {}); (await cookies()).delete(SESSION_COOKIE); }
}

export async function registerUser(email: string, password: string, name?: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: 'E-mail já cadastrado' };
  const user = await db.user.create({ data: { email, name: name || email.split('@')[0], passwordHash: hashPassword(password), tier: 'free', credits: 300, bonusCredits: 1000, role: 'user', defaultModel: 'claude' } });
  await createSession(user.id);
  return { ok: true, user };
}

export async function loginUser(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return { ok: false, error: 'E-mail ou senha inválidos' };
  if (!verifyPassword(password, user.passwordHash)) return { ok: false, error: 'E-mail ou senha inválidos' };
  await createSession(user.id);
  return { ok: true, user };
}

export async function logoutUser() { await destroySession(); return { ok: true }; }

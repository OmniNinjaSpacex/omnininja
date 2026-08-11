import { NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { parseJsonRequest } from '@/lib/http-body';

export async function POST(req: Request) {
  const parsedRequest = await parseJsonRequest(req, 16 * 1024);
  if (!parsedRequest.ok) return parsedRequest.response;
  const { email, password } = parsedRequest.body;
  if (!email || !password) return NextResponse.json({ error: 'email e password obrigatórios' }, { status: 400 });
  const rateLimit = checkRateLimit(req, 'auth-login', 10, 15 * 60_000, String(email));
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const result = await loginUser(email, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });
  return NextResponse.json({ ok: true, user: { id: result.user!.id, email: result.user!.email, name: result.user!.name, tier: result.user!.tier, role: result.user!.role } });
}

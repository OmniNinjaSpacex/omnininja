import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { parseJsonRequest } from '@/lib/http-body';

export async function POST(req: Request) {
  const parsedRequest = await parseJsonRequest(req, 16 * 1024);
  if (!parsedRequest.ok) return parsedRequest.response;
  const body = parsedRequest.body;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : undefined;

  if (!email || !password) {
    return NextResponse.json(
      { error: 'E-mail e senha são obrigatórios.' },
      { status: 400 },
    );
  }

  const rateLimit = checkRateLimit(req, 'auth-register', 5, 60 * 60_000, email);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  if (password.length < 8 || password.length > 256) {
    return NextResponse.json(
      { error: 'A senha precisa ter entre 8 e 256 caracteres.' },
      { status: 400 },
    );
  }

  const result = await registerUser(email, password, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: result.user!.id,
      email: result.user!.email,
      name: result.user!.name,
    },
  });
}

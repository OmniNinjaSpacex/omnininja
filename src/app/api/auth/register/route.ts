import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : undefined;

  if (!email || !password) {
    return NextResponse.json(
      { error: 'E-mail e senha são obrigatórios.' },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'A senha precisa ter pelo menos 8 caracteres.' },
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

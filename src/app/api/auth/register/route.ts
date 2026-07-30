import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth';

export async function POST(req: Request) {
  const { email, password, name } = await req.json().catch(() => ({} as any));
  if (!email || !password) return NextResponse.json({ error: 'email e password obrigatórios' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Senha mín. 6 caracteres' }, { status: 400 });
  const result = await registerUser(email, password, name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, user: { id: result.user!.id, email: result.user!.email, name: result.user!.name } });
}

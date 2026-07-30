import { NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({} as any));
  if (!email || !password) return NextResponse.json({ error: 'email e password obrigatórios' }, { status: 400 });
  const result = await loginUser(email, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });
  return NextResponse.json({ ok: true, user: { id: result.user!.id, email: result.user!.email, name: result.user!.name, tier: result.user!.tier, role: result.user!.role } });
}

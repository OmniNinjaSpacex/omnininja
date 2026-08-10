import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const OMNINJA_MODEL = process.env.OMNINJA_MODEL || 'gpt-5.1';

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, configured: false, model: 'OMNINJA', error: 'OPENAI_API_KEY ausente' },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/models/${encodeURIComponent(OMNINJA_MODEL)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({} as any));
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          model: 'OMNINJA',
          upstreamStatus: response.status,
          error: payload?.error?.message || 'OpenAI não confirmou acesso ao modelo configurado',
          latencyMs: Date.now() - startedAt,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      model: 'OMNINJA',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        model: 'OMNINJA',
        error: error?.message || 'Falha ao contatar OpenAI',
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}

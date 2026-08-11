import { NextResponse } from 'next/server';
import { OPENAI_BASE_URL } from '@/lib/openai-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OMNINJA_MODEL = process.env.OMNINJA_MODEL || 'gpt-5.6';

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, configured: false, model: 'OMNINJA', error: 'OMNINJA não configurado neste deploy.' },
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
      console.error('[health] mecanismo OMNININJA indisponível', response.status);
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          model: 'OMNINJA',
          error: 'O mecanismo do OMNINJA não confirmou disponibilidade.',
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
  } catch (error) {
    console.error('[health] falha ao verificar mecanismo OMNININJA', error);
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        model: 'OMNINJA',
        error: 'Falha ao verificar o mecanismo do OMNININJA.',
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}

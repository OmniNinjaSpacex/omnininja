import { NextResponse } from 'next/server';
import { OPENAI_BASE_URL } from '@/lib/openai-services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OMNININJA_MODEL = process.env.OMNININJA_MODEL || 'gpt-5.6';
const HEALTH_MODEL_ID = OMNININJA_MODEL === 'gpt-5.6' ? 'gpt-5.6-sol' : OMNININJA_MODEL;

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, configured: false, model: 'OMNININJA', error: 'OMNININJA não configurado neste deploy.' },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/models/${encodeURIComponent(HEALTH_MODEL_ID)}`, {
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
          model: 'OMNININJA',
          error: 'O mecanismo do OMNININJA não confirmou disponibilidade.',
          latencyMs: Date.now() - startedAt,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      model: 'OMNININJA',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[health] falha ao verificar mecanismo OMNININJA', error);
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        model: 'OMNININJA',
        error: 'Falha ao verificar o mecanismo do OMNININJA.',
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}

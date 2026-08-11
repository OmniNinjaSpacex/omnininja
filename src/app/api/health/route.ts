import { NextResponse } from 'next/server';
import { db } from '#omninininja/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      service: 'OMNININJA',
      database: 'operational',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[health] PostgreSQL indisponível', error);
    return NextResponse.json(
      {
        ok: false,
        service: 'OMNININJA',
        database: 'unavailable',
        error: 'Verificação do banco falhou.',
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}

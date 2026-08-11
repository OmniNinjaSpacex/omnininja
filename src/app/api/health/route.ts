import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      service: 'OMNINJA',
      database: 'operational',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[health] PostgreSQL indisponível', error);
    return NextResponse.json(
      {
        ok: false,
        service: 'OMNINJA',
        database: 'unavailable',
        error: 'Verificação do banco falhou.',
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}

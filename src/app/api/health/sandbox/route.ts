import { NextResponse } from 'next/server';
import { ailabHealth } from '@/lib/ailab-sandbox';
import { sandboxHealth } from '#omninininja/sandbox';
import { getSandboxProvider } from '#omninininja/shell-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = getSandboxProvider();

  if (provider === 'disabled') {
    return NextResponse.json({
      ok: true,
      service: 'execution',
      executionEnabled: false,
    });
  }

  if (provider === 'ailab') {
    const health = await ailabHealth();
    const ok = health.configured && health.reachable;
    if (!ok) console.error('[health] execução remota indisponível', health.error || 'not ready');
    return NextResponse.json(
      {
        ok,
        service: 'execution',
        executionEnabled: ok,
        ...(ok ? {} : { error: 'Ambiente de execução indisponível.' }),
      },
      { status: ok ? 200 : 503 },
    );
  }

  const local = sandboxHealth();
  const production = process.env.NODE_ENV === 'production';
  const executionEnabled = !production || local.productionSafe;

  return NextResponse.json(
    {
      ok: executionEnabled,
      service: 'execution',
      executionEnabled,
      ...(executionEnabled ? {} : { error: 'Ambiente de execução seguro indisponível.' }),
    },
    { status: executionEnabled ? 200 : 503 },
  );
}

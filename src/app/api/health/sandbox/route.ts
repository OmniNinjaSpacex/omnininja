import { NextResponse } from 'next/server';
import { ailabHealth } from '@/lib/ailab-sandbox';
import { sandboxHealth } from '@/lib/sandbox';
import { getSandboxProvider } from '@/lib/shell-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = getSandboxProvider();

  if (provider === 'disabled') {
    return NextResponse.json({
      ok: true,
      provider: 'disabled',
      configured: true,
      reachable: true,
      productionSafe: true,
      executionEnabled: false,
    });
  }

  if (provider === 'ailab') {
    const health = await ailabHealth();
    const ok = health.configured && health.reachable;
    return NextResponse.json(
      {
        ok,
        provider: 'ailab',
        configured: health.configured,
        reachable: health.reachable,
        productionSafe: health.productionSafe,
        executionEnabled: ok,
        securityModel: health.securityModel,
        error: health.error,
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
      provider: 'local',
      configured: true,
      reachable: true,
      productionSafe: local.productionSafe,
      executionEnabled,
      level: local.level,
      levelName: local.levelName,
      hasUnshare: local.hasUnshare,
      hasProot: local.hasProot,
      hasBaseImage: local.hasBaseImage,
    },
    { status: executionEnabled ? 200 : 503 },
  );
}

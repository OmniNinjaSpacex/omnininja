// OmniNinja — API de saúde do Sandbox VM
// Retorna o nível de isolamento, recursos, e status dos componentes.

import { NextResponse } from 'next/server';
import { sandboxHealth } from '@/lib/sandbox';
import { getBrowserMode } from '@/lib/browser-agent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const health = sandboxHealth();
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sandbox: {
      level: health.level,
      levelName: health.levelName,
      description:
        health.level === 2
          ? 'Namespace Linux isolado (unshare+proot) — isolamento máximo, estilo E2B/Firecracker'
          : health.level === 1
            ? 'Chroot Ubuntu isolado — filesystem separado por task'
            : 'Diretório isolado por task — isolamento de workspace',
      hasUnshare: health.hasUnshare,
      hasProot: health.hasProot,
      hasBaseImage: health.hasBaseImage,
      paths: {
        workspaceRoot: health.workspaceRoot,
        sandboxBase: health.sandboxBase,
        baseImage: health.baseImage,
      },
    },
    manusCompatible: true,
    architecture: 'OmniNinja VM Sandbox — cada task roda em máquina virtual isolada (estilo Manus AI)',
    browser: {
      mode: getBrowserMode(),
      description: getBrowserMode() === 'browserless'
        ? 'Browserless cloud (Chromium gerenciado na nuvem via WebSocket/CDP)'
        : 'Chromium local (Playwright com browser instalado no Ubuntu)',
    },
  });
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCreditBalance } from '@/lib/credits';
import { getConfiguredProviders } from '@/lib/providers';

// Returns the current demo user + configured providers + credit balance.
// If NO provider has a key configured (typical sandbox state), we expose a
// curated DEMO set so the workspace is explorable — the Admin "Integrações"
// sheet always reports the TRUE configured/absent status (Seção 4.5).
const DEMO_FALLBACK = ['glm', 'claude', 'chatgpt', 'gemini', 'kimi'] as const;

export async function GET() {
  const user = await getCurrentUser();
  const balance = await getCreditBalance(user.id);
  const configured = getConfiguredProviders().map((p) => p.id);
  const demoMode = configured.length === 0;
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      tier: user.tier,
      credits: balance.credits,
      bonusCredits: balance.bonusCredits,
      role: user.role,
    },
    providers: demoMode ? [...DEMO_FALLBACK] : configured,
    demoMode,
  });
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCreditBalance } from '@/lib/credits';
import { getConfiguredProviders } from '@/lib/providers';

const DEMO_FALLBACK = ['glm', 'claude', 'chatgpt', 'gemini', 'kimi'] as const;

export async function GET() {
  const user = await getCurrentUser();
  const balance = await getCreditBalance(user.id);
  const configured = getConfiguredProviders().map((p) => p.id);
  const demoMode = configured.length === 0;
  return NextResponse.json({
    user: {
      id: user.id, email: user.email, name: user.name, tier: user.tier,
      credits: balance.credits, bonusCredits: balance.bonusCredits, role: user.role,
    },
    providers: demoMode ? [...DEMO_FALLBACK] : configured,
    demoMode,
  });
}

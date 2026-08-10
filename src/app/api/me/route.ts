import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCreditBalance } from '@/lib/credits';

// Truthful capability snapshot. The public product exposes one model identity:
// OMNINJA. Provider implementation details remain server-side.
export async function GET() {
  const user = await getCurrentUser();
  const balance = await getCreditBalance(user.id);

  const openAIReady = Boolean(process.env.OPENAI_API_KEY?.trim());
  const browserlessReady = Boolean(process.env.BROWSERLESS_API_KEY?.trim());

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
    model: openAIReady ? 'OMNINJA' : null,
    providers: openAIReady ? ['chatgpt'] : [],
    demoMode: false,
    capabilities: {
      chat: openAIReady,
      tools: openAIReady,
      browserless: browserlessReady,
      reasoningEffort: openAIReady,
      thinkingToggle: openAIReady,
    },
  });
}

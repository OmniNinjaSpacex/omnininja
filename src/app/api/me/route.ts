import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCreditBalance } from '@/lib/credits';

// Public capability snapshot for the single OMNININJA product identity.
// Provider implementation details stay server-side.
export async function GET() {
  const user = await getCurrentUser();
  const balance = await getCreditBalance(user.id);

  const openAIReady = Boolean(process.env.OPENAI_API_KEY?.trim());
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
    model: openAIReady ? 'OMNININJA' : null,
    capabilities: {
      chat: openAIReady,
      tools: openAIReady,
      reasoningEffort: openAIReady,
      thinkingToggle: openAIReady,
    },
  });
}

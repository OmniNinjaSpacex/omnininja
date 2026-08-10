import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCreditBalance } from '@/lib/credits';

// Production capability snapshot for the current account.
// Never advertise fake/demo providers: the UI must reflect what the server can
// actually execute with the configured secrets.
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
    providers: openAIReady ? ['chatgpt'] : [],

    // The old UI calls this field demoMode. We deliberately keep it false:
    // production never runs a simulated AI fallback. Capability failures are
    // reported explicitly by /api/chat and /api/agent/run.
    demoMode: false,

    capabilities: {
      chat: openAIReady,
      agent: openAIReady,
      browserless: browserlessReady,
    },
  });
}

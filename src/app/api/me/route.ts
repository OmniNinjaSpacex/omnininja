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
    // OpenAI is currently the real central model backend.
    providers: openAIReady ? ['chatgpt'] : [],
    // Kept for compatibility with the current workspace banner. No simulated
    // responses or simulated agent actions are executed when this is true.
    demoMode: !openAIReady,
    capabilities: {
      chat: openAIReady,
      agent: openAIReady,
      browserless: browserlessReady,
    },
  });
}

// OmniNinja — Credits & billing (Seção 11.4)
import { db } from './db';

export const TIER_CONFIG = {
  free: { label: 'Free', monthlyCredits: 0, dailyCredits: 300, bonus: 1000, parallelTasks: 1, price: 0 },
  pro: { label: 'Pro', monthlyCredits: 4000, dailyCredits: 300, bonus: 0, parallelTasks: 4, price: 20 },
  business: { label: 'Business', monthlyCredits: 8000, dailyCredits: 300, bonus: 0, parallelTasks: 20, price: 50 },
  team: { label: 'Team', monthlyCredits: 0, dailyCredits: 300, bonus: 0, parallelTasks: 20, price: 20 },
  enterprise: { label: 'Enterprise', monthlyCredits: 40000, dailyCredits: 300, bonus: 0, parallelTasks: 999, price: 200 },
} as const;

export type Tier = keyof typeof TIER_CONFIG;

// rough credit cost per agent action — tuned so a typical task costs ~30-120 credits
export const CREDIT_COSTS = {
  chat_message: 1,
  agent_step: 5,
  browser_action: 3,
  terminal_command: 2,
  file_write: 1,
  search_query: 4,
  deep_research_step: 12,
} as const;

export async function consumeCredits(userId: string, amount: number, reason: string, taskId?: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, remaining: 0 };
  const total = user.credits + user.bonusCredits;
  if (total < amount) return { ok: false, remaining: total };
  // spend bonus first
  const fromBonus = Math.min(user.bonusCredits, amount);
  const fromMain = amount - fromBonus;
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      bonusCredits: { decrement: fromBonus },
      credits: { decrement: fromMain },
    },
  });
  await db.creditTransaction.create({
    data: { userId, delta: -amount, reason, taskId: taskId ?? null },
  });
  return { ok: true, remaining: updated.credits + updated.bonusCredits };
}

export async function grantCredits(userId: string, amount: number, reason: string) {
  const updated = await db.user.update({
    where: { id: userId },
    data: { credits: { increment: amount } },
  });
  await db.creditTransaction.create({
    data: { userId, delta: amount, reason },
  });
  return { ok: true, remaining: updated.credits + updated.bonusCredits };
}

export async function getCreditBalance(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { credits: 0, bonusCredits: 0, total: 0 };
  return {
    credits: user.credits,
    bonusCredits: user.bonusCredits,
    total: user.credits + user.bonusCredits,
  };
}

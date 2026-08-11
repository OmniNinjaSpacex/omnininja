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
  image_generation: 8,
  video_generation: 25,
  transcription: 1,
  speech: 1,
  realtime_session: 2,
} as const;

export async function consumeCredits(userId: string, amount: number, reason: string, taskId?: string) {
  const requested = Math.max(0, Math.trunc(amount));
  if (requested <= 0) return { ok: false as const, remaining: 0 };

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false as const, remaining: 0 };

    const total = user.credits + user.bonusCredits;
    if (total < requested) return { ok: false as const, remaining: total };

    const fromBonus = Math.min(user.bonusCredits, requested);
    const fromMain = requested - fromBonus;
    const debit = await tx.user.updateMany({
      where: {
        id: userId,
        bonusCredits: { gte: fromBonus },
        credits: { gte: fromMain },
      },
      data: {
        bonusCredits: { decrement: fromBonus },
        credits: { decrement: fromMain },
      },
    });

    if (debit.count !== 1) {
      const current = await tx.user.findUnique({ where: { id: userId } });
      return {
        ok: false as const,
        remaining: current ? current.credits + current.bonusCredits : 0,
      };
    }

    const [updated, transaction] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId } }),
      tx.creditTransaction.create({
        data: { userId, delta: -requested, reason, taskId: taskId ?? null },
      }),
    ]);

    return {
      ok: true as const,
      remaining: updated.credits + updated.bonusCredits,
      transactionId: transaction.id,
      debit: { credits: fromMain, bonusCredits: fromBonus },
    };
  });
}

export async function grantCredits(userId: string, amount: number, reason: string) {
  const granted = Math.max(0, Math.trunc(amount));
  if (granted <= 0) return { ok: false, remaining: 0 };

  return db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: granted } },
    });
    await tx.creditTransaction.create({
      data: { userId, delta: granted, reason },
    });
    return { ok: true, remaining: updated.credits + updated.bonusCredits };
  });
}

export async function refundCreditDebit(
  userId: string,
  debit: { credits: number; bonusCredits: number },
  reason: string,
  taskId?: string,
) {
  const credits = Math.max(0, Math.trunc(debit.credits));
  const bonusCredits = Math.max(0, Math.trunc(debit.bonusCredits));
  const total = credits + bonusCredits;
  if (total <= 0) return;

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        credits: { increment: credits },
        bonusCredits: { increment: bonusCredits },
      },
    }),
    db.creditTransaction.create({
      data: { userId, delta: total, reason, taskId: taskId ?? null },
    }),
  ]);
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

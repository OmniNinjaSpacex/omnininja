import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

// Credit balance + recent transactions for the current user.
export async function GET() {
  const user = await getCurrentUser();
  const transactions = await db.creditTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({
    credits: user.credits,
    bonusCredits: user.bonusCredits,
    total: user.credits + user.bonusCredits,
    transactions,
  });
}

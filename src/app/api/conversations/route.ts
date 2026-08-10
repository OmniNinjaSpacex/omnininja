import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();

  const tasks = await db.task.findMany({
    where: { userId: user.id, mode: 'omnininja' },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      finishedAt: true,
    },
  });

  return NextResponse.json({ conversations: tasks });
}

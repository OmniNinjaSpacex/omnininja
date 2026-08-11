import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '#omninininja/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const query = new URL(req.url).searchParams.get('q')?.trim().slice(0, 120) || '';

  const tasks = await db.task.findMany({
    where: {
      userId: user.id,
      mode: { in: ['omnininja', 'chat', 'work', 'codex'] },
      ...(query ? {
        OR: [
          { title: { contains: query, mode: 'insensitive' as const } },
          { messages: { some: { content: { contains: query, mode: 'insensitive' as const } } } },
        ],
      } : {}),
    },
    orderBy: [
      { pinnedAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
    ],
    take: query ? 80 : 50,
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      pinnedAt: true,
      finishedAt: true,
    },
  });

  return NextResponse.json({ conversations: tasks });
}

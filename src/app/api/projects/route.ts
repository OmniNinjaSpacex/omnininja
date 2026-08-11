import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { parseJsonRequest } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      updatedAt: true,
      _count: { select: { tasks: true } },
    },
  });

  return NextResponse.json({
    projects: projects.map(({ _count, ...project }) => ({
      ...project,
      tasksCount: _count.tasks,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'project-create', 20, 60 * 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const parsedRequest = await parseJsonRequest(req, 8 * 1024);
  if (!parsedRequest.ok) return parsedRequest.response;
  const body = parsedRequest.body;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) {
    return NextResponse.json({ error: 'Nome do projeto obrigatório.' }, { status: 400 });
  }

  const project = await db.project.create({
    data: { userId: user.id, name },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ project: { ...project, tasksCount: 0 } }, { status: 201 });
}

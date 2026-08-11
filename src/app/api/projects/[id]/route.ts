import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '#omninininja/db';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const rateLimit = checkRateLimit(req, 'project-delete', 20, 60 * 60_000, user.id);
  if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const { id } = await context.params;

  const result = await db.project.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}

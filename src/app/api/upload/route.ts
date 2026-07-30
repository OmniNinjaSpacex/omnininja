import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const UPLOAD_DIR = '/tmp/omninja-uploads';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Máx 10MB' }, { status: 413 });
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  const userDir = join(UPLOAD_DIR, user.id);
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}-${safeName}`;
  const filePath = join(userDir, uniqueName);
  const bytes = await file.arrayBuffer();
  writeFileSync(filePath, Buffer.from(bytes));
  return NextResponse.json({ ok: true, file: { name: file.name, size: file.size, type: file.type, path: filePath } });
}

export async function GET() {
  const user = await getCurrentUser();
  const { readdirSync, statSync } = await import('fs');
  const userDir = join(UPLOAD_DIR, user.id);
  if (!existsSync(userDir)) return NextResponse.json({ files: [] });
  const files = readdirSync(userDir).map((name) => {
    const stat = statSync(join(userDir, name));
    return { name, path: join(userDir, name), size: stat.size, createdAt: stat.mtime };
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);
  return NextResponse.json({ files });
}

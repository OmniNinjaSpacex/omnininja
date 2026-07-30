import { NextResponse } from 'next/server';
import { classifyMessage } from '@/lib/orchestrator';

// Classify a message as 'chat' or 'task' (Seção 11.5 / Seção 16).
// In production this calls the chat model with a short classifier prompt.
export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({} as { text?: string }));
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  const kind = classifyMessage(text);
  return NextResponse.json({ kind });
}

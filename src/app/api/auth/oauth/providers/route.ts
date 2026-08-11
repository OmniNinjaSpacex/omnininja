import { NextResponse } from 'next/server';
import { configuredOAuthProviders } from '@/lib/oauth-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { providers: configuredOAuthProviders() },
    { headers: { 'cache-control': 'no-store' } },
  );
}

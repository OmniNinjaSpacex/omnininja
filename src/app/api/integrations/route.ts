import { NextResponse } from 'next/server';
import { getIntegrationStatuses, countConfigured } from '@/lib/integrations';

// Status das Integrações — only configured/absent, never key values.
export async function GET() {
  return NextResponse.json({
    integrations: getIntegrationStatuses(),
    counts: countConfigured(),
  });
}

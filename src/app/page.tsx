'use client';

import { useOmni } from '@/lib/store';
import { LandingPage } from '@/components/omninja/landing';
import { Workspace } from '@/components/omninja/workspace';

export default function Home() {
  const view = useOmni((s) => s.view);
  return view === 'landing' ? <LandingPage /> : <Workspace />;
}

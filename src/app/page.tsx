'use client';

import { LandingPage } from '@/components/omninja/landing';
import { Workspace } from '@/components/omninja/workspace';
import { useOmni } from '@/lib/store';

export default function Home() {
  const view = useOmni((state) => state.view);
  return view === 'workspace' ? <Workspace /> : <LandingPage />;
}

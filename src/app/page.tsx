'use client';

import { useEffect } from 'react';
import { LandingPage } from '@/components/omninja/landing';
import { Workspace } from '@/components/omninja/workspace';
import { useOmni } from '@/lib/store';

export default function Home() {
  const view = useOmni((state) => state.view);
  const setView = useOmni((state) => state.setView);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('workspace') === '1') {
      setView('workspace');
    }
  }, [setView]);

  return view === 'workspace' ? <Workspace /> : <LandingPage />;
}

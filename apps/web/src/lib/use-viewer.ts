'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export type Viewer = {
  id: string;
  email: string | null;
  displayName: string | null;
  canAccessAdministration: boolean;
};

export function useViewer(): Viewer | null {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let current = true;
    let generation = 0;
    let pending: AbortController | null = null;
    const refresh = async (invalidate = false) => {
      const request = ++generation;
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      if (invalidate) setViewer(null);
      try {
        const response = await fetch('/api/viewer', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        });
        const body = response.ok ? await response.json() as { viewer?: Viewer | null } : { viewer: null };
        if (current && request === generation) setViewer(body.viewer ?? null);
      } catch {
        if (current && request === generation) setViewer(null);
      }
    };
    const onRefresh = () => { void refresh(); };
    const onIdentityChanged = () => { void refresh(true); };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('sb-')) onIdentityChanged();
    };
    void refresh();
    window.addEventListener('focus', onRefresh);
    window.addEventListener('online', onRefresh);
    window.addEventListener('pageshow', onRefresh);
    window.addEventListener('practice-owner-changed', onIdentityChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      current = false;
      generation += 1;
      pending?.abort();
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('online', onRefresh);
      window.removeEventListener('pageshow', onRefresh);
      window.removeEventListener('practice-owner-changed', onIdentityChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, [pathname]);

  return viewer;
}

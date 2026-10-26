'use client';

import { useEffect, useState } from 'react';
import { practiceOwnerKey, type PracticeIdentity } from './practice-sync-contract';

/** Resolve identity before opening a cache. Failed identity checks never open an account cache. */
export function usePracticeOwner(): string | null {
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    let generation = 0;
    let refreshing = false;
    let queued = false;
    const refresh = async () => {
      const request = ++generation;
      if (refreshing) { queued = true; return; }
      refreshing = true;
      try {
        const response = await fetch('/api/practice/owner', { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
        if (!response.ok) throw new Error('Identity unavailable');
        const { owner } = await response.json() as { owner?: PracticeIdentity };
        if (!owner || !['user', 'guest'].includes(owner.kind) || typeof owner.id !== 'string' || !owner.id) throw new Error('Invalid identity');
        if (current && request === generation) setScope(practiceOwnerKey(owner));
      } catch {
        if (current && request === generation) setScope(value => value ?? 'device');
      } finally {
        refreshing = false;
        if (current && queued) { queued = false; void refresh(); }
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('sb-')) void refresh();
    };
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('practice-owner-changed', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      current = false;
      generation += 1;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('practice-owner-changed', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return scope;
}

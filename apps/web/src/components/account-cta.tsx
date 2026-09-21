'use client';

import { useViewer } from '@/lib/use-viewer';

export function AccountCta() {
  const viewer = useViewer();
  return viewer ? (
    <a className="rounded-md border border-[var(--coral)] px-5 py-3 font-semibold text-[var(--coral)]" href="/settings">
      Open my settings
    </a>
  ) : (
    <a className="rounded-md border border-[var(--coral)] px-5 py-3 font-semibold text-[var(--coral)]" href="/auth">
      Sign in to save progress
    </a>
  );
}

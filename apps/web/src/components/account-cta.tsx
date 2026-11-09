'use client';

import { useViewer } from '@/lib/use-viewer';
import Link from 'next/link';

export function AccountCta() {
  const viewer = useViewer();
  return viewer ? (
    <Link className="rounded-md border border-[var(--coral)] px-5 py-3 font-semibold text-[var(--coral)]" href="/settings">
      Open my settings
    </Link>
  ) : (
    <Link className="rounded-md border border-[var(--coral)] px-5 py-3 font-semibold text-[var(--coral)]" href="/auth">
      Sign in to save progress
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PracticeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Practice workspace failed to load", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[var(--paper)] px-6 py-16 text-[var(--ink)]">
      <section className="mx-auto max-w-xl rounded-2xl border border-[var(--line)] bg-white p-8 shadow-sm">
        <p className="eyebrow">Practice workspace</p>
        <h1 className="mt-2 text-3xl font-bold">Your work is safe. Let’s reload the workspace.</h1>
        <p className="mt-4 leading-7 text-[var(--muted)]">
          A temporary problem stopped this page from loading. Your draft remains on this device whenever browser storage is available.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button className="button" onClick={reset} type="button">Try again</button>
          <Link className="button secondary" href="/">Return home</Link>
        </div>
      </section>
    </main>
  );
}

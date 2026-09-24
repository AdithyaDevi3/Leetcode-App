import Link from 'next/link';
import { SiteNavigation } from '@/components/site-navigation';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] px-6 py-8 text-[var(--ink)] sm:py-12">
      <div className="mx-auto max-w-5xl">
        <SiteNavigation currentPath="/offline" />
      <section className="mx-auto mt-10 max-w-lg rounded-xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Method is offline</p>
        <h1 className="mt-3 text-2xl font-bold">Your draft stays on this device.</h1>
        <p className="mt-3 leading-6 text-[var(--muted)]">Your learning plan, practice drafts, completed history, and system-design draft stay in this browser. You can keep working now; feedback falls back to the local evaluator when a server is unavailable.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="rounded bg-[var(--moss)] px-4 py-2 font-semibold text-white" href="/practice">Continue practice</Link>
          <Link className="rounded border border-slate-300 px-4 py-2 font-semibold" href="/history">View history</Link>
          <Link className="rounded border border-slate-300 px-4 py-2 font-semibold" href="/">Home</Link>
        </div>
      </section>
      </div>
    </main>
  );
}

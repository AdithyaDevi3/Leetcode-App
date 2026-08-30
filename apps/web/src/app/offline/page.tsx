import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-20 text-slate-900">
      <section className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Method is offline</p>
        <h1 className="mt-3 text-2xl font-bold">Your draft stays on this device.</h1>
        <p className="mt-3 leading-6 text-slate-600">Your learning plan, practice drafts, completed history, and system-design draft stay in this browser. You can keep working now; feedback falls back to the local evaluator when a server is unavailable.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/practice">Continue practice</Link>
          <Link className="rounded border border-slate-300 px-4 py-2 font-semibold" href="/history">View history</Link>
          <Link className="rounded border border-slate-300 px-4 py-2 font-semibold" href="/">Home</Link>
        </div>
      </section>
    </main>
  );
}

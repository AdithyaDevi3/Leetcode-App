'use client';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="rounded-xl border border-[var(--coral)] bg-[var(--coral-soft)] p-7 text-red-950">
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em]">Administration unavailable</p>
    <h1 className="text-2xl font-bold">This view could not load</h1>
    <p className="mt-3 max-w-xl">Your session is safe. Retry the request, and check database readiness if the problem continues.</p>
    <button className="mt-5 min-h-11 rounded-md bg-red-950 px-4 font-bold text-white" onClick={reset} type="button">Try again</button>
  </section>;
}

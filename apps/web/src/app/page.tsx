import Link from 'next/link';

export default function Home() {
  return <main className="min-h-screen px-6 py-8 text-[var(--ink)] sm:py-12">
    <nav className="mx-auto flex max-w-6xl items-center justify-between border-b border-[var(--line)] pb-6"><Link className="flex items-center gap-2 text-lg font-bold" href="/"><span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--mustard)] font-mono text-sm">M</span>Method</Link><Link className="rounded-md border border-[#b9c8bd] bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--moss)]" href="/auth">Sign in</Link></nav>
    <section className="mx-auto grid max-w-6xl gap-8 py-12 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--coral)]">Structured practice</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Learn the reasoning before the syntax.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">Practice algorithms in structured English, receive evidence-based feedback, and move into code only when your plan is ready. Your learning plan and drafts work locally in this browser.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link className="rounded-md bg-[var(--moss)] px-5 py-3 font-semibold text-white transition hover:bg-[#193e2e]" href="/practice">Start a practice session</Link>
          <Link className="rounded-md border border-[#b9c8bd] bg-[var(--surface)] px-5 py-3 font-semibold text-[var(--moss)]" href="/onboarding">Build my learning plan</Link>
          <Link className="rounded-md border border-[var(--coral)] px-5 py-3 font-semibold text-[var(--coral)]" href="/auth">Sign in to save progress</Link>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--muted)]">
          <Link className="underline decoration-[#b9c8bd] underline-offset-4 hover:text-[var(--moss)]" href="/learn">My learning plan</Link>
          <Link className="underline decoration-[#b9c8bd] underline-offset-4 hover:text-[var(--moss)]" href="/dashboard">Dashboard</Link>
          <Link className="underline decoration-[#b9c8bd] underline-offset-4 hover:text-[var(--moss)]" href="/history">Practice history</Link>
          <Link className="underline decoration-[#b9c8bd] underline-offset-4 hover:text-[var(--moss)]" href="/library">Study library</Link>
          <Link className="underline decoration-[#b9c8bd] underline-offset-4 hover:text-[var(--moss)]" href="/system-design">System design practice</Link>
          <Link className="underline decoration-[#b9c8bd] underline-offset-4 hover:text-[var(--moss)]" href="/offline">Continue offline</Link>
          <Link className="underline decoration-[#b9c8bd] underline-offset-4 hover:text-[var(--moss)]" href="/requests">Request a question or feature</Link>
        </div>
      </div>
      <aside className="border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_18px_50px_rgba(34,46,38,.08)]">
        <p className="text-sm font-semibold text-[var(--coral)]">The learner loop</p>
        <ol className="mt-5 space-y-5">
          {[
            ['1', 'Plan', 'Describe your state, decisions, and edge cases in plain language.'],
            ['2', 'Evaluate', 'See deterministic feedback tied to the reasoning requirements.'],
            ['3', 'Implement', 'Translate an approved plan into code when you are ready.'],
          ].map(([number, title, detail]) => <li className="flex gap-4" key={number}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--mustard)] font-bold">{number}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{detail}</p></div></li>)}
        </ol>
      </aside>
    </section>
  </main>;
}

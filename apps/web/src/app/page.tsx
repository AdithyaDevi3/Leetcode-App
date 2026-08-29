import Link from 'next/link';

export default function Home() {
  return <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
    <section className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Method</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Learn the reasoning before the syntax.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Practice algorithms in structured English, receive evidence-based feedback, and move into code only when your plan is ready.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200" href="/practice">Start a practice session</Link>
          <Link className="rounded-lg border border-slate-600 px-5 py-3 font-semibold text-slate-100 transition hover:border-slate-300" href="/onboarding">Build my learning plan</Link>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
          <Link className="underline decoration-slate-600 underline-offset-4 hover:text-white" href="/learn">My learning plan</Link>
          <Link className="underline decoration-slate-600 underline-offset-4 hover:text-white" href="/dashboard">Dashboard</Link>
          <Link className="underline decoration-slate-600 underline-offset-4 hover:text-white" href="/system-design">System design practice</Link>
        </div>
      </div>
      <aside className="rounded-2xl border border-slate-700 bg-slate-900/70 p-7 shadow-2xl shadow-cyan-950/20">
        <p className="text-sm font-semibold text-cyan-300">The learner loop</p>
        <ol className="mt-5 space-y-5">
          {[
            ['1', 'Plan', 'Describe your state, decisions, and edge cases in plain language.'],
            ['2', 'Evaluate', 'See deterministic feedback tied to the reasoning requirements.'],
            ['3', 'Implement', 'Translate an approved plan into code when you are ready.'],
          ].map(([number, title, detail]) => <li className="flex gap-4" key={number}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-300 font-bold text-slate-950">{number}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-300">{detail}</p></div></li>)}
        </ol>
      </aside>
    </section>
  </main>;
}

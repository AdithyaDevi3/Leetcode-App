import Link from 'next/link';
import { PracticeHistory } from '@/components/practice-history';

export default function HistoryPage() {
  return <main className="min-h-screen px-6 py-8 text-[var(--ink)] sm:py-12"><section className="mx-auto max-w-4xl"><nav aria-label="Learner navigation" className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5 text-sm"><Link className="flex items-center gap-2 font-bold" href="/"><span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--mustard)] font-mono text-xs">M</span>Method</Link><div className="flex gap-4 font-semibold text-[var(--moss)]"><Link href="/dashboard">Dashboard</Link><Link href="/library">Study library</Link></div></nav><div className="mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Practice history</p><h1>Your saved reasoning</h1><p className="mt-3 max-w-2xl text-[var(--muted)]">Review session progress, saved revisions, and evaluation feedback—then decide what to practice next.</p></div><Link className="button" href="/practice">Practice again</Link></div><div className="mt-8"><PracticeHistory /></div></section></main>;
}

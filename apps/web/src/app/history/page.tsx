import Link from 'next/link';
import { PracticeHistory } from '@/components/practice-history';

export default function HistoryPage() {
  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><section className="mx-auto max-w-4xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Practice history</p><h1 className="mt-2 text-3xl font-bold">Your saved reasoning</h1><p className="mt-3 max-w-2xl text-slate-600">Review session progress, saved revisions, and the latest evaluation summary.</p></div><Link className="rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/practice">Practice again</Link></div><div className="mt-8"><PracticeHistory /></div></section></main>;
}
